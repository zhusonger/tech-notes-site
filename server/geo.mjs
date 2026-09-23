/**
 * ip2region 离线地区查询（IPv4）。
 *
 * 为什么自己实现而不引 npm 包：
 *   1. 这个项目的依赖一向克制（只有 express / helmet / rate-limit / otplib / qrcode），
 *      「为了在后台多显示一列地区」去换一个供应链依赖并不划算；
 *   2. ip2region 官方已不再在主仓维护 Node binding，npm 上的都是第三方实现，
 *      版本与 xdb 格式的兼容性需要自己盯，反而不如把查询逻辑握在手里。
 *   xdb 的查询本身很短——向量索引定位分区 + 14 字节步长的二分查找，不值得引包。
 *
 * 文件格式（实测 v3 xdb，与官方文档描述一致）：
 *   Header    0 .. 256           固定 256 字节，含「索引起始地址」等
 *   Vector    256 .. 524544      固定 512 KiB，256x256 个 8 字节项（startPtr + endPtr，小端）
 *   地区信息  524544 .. 索引起点 UTF-8 字符串，按需写入、自动去重
 *   二分索引  索引起点 .. EOF     IPv4 每项固定 14 字节
 *
 * 地区库约 11 MB，既不进版本库也不进镜像 —— 它是一份**可重新获取的公开数据**：
 *   进 git：每次 clone 都要拖一遍，而它跟着上游更新，冻结进历史没有意义；
 *   进镜像：每次构建都要联网拉一次，拉不到整个构建就失败，而它只是后台的
 *   一列地区。
 * 所以改为**按需获取**：首次有人打开访客列表时，缺库就在后台拉一次（见 ensureGeo）。
 *
 * 落点是**持久化目录**（与 SQLite 库同目录），这不是随手选的：
 *   容器根文件系统是只读的（compose 里 read_only: true），只有 data/ 这个
 *   bind mount 可写；而且它跨容器重建保留 —— 「只需要拉一次」才成立。
 *
 * 探测顺序：`IP2REGION_XDB` → 持久化目录 → `vendor/`（旧镜像的内置位置）。
 * 文件缺失或正在下载时本模块**不报错**，只把地区降级为 null ——
 * 少一列地区不该让整个访客列表打不开。
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { fetchGeoDb } from './geo-fetch.mjs'

/** 自行推导项目根，不 import db.mjs —— 后者在模块顶层就会建目录、开数据库，不该被一个查表模块牵连 */
const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))

const HEADER_SIZE = 256
const VECTOR_INDEX_SIZE = 512 * 1024
/** IPv4 二分索引项：开始 IP(4) + 结束 IP(4) + 数据长度(2) + 数据指针(4) */
const SEGMENT_SIZE = 14

/**
 * 运行期下载的落点：**持久化目录**，与 SQLite 库放在一起。
 *
 * 推导规则刻意与 db.mjs 的 dbPath 保持一致（`DB_PATH` → `data/tech-notes.db`），
 * 但**刻意不 import db.mjs** —— 后者在模块顶层就会建目录、开数据库，
 * 一个查表模块不该把它牵连进来。
 */
const dbFile = process.env.DB_PATH ?? join(projectRoot, 'data/tech-notes.db')
export const xdbPath = join(dirname(resolve(dbFile)), 'ip2region_v4.xdb')

/**
 * 按序找一份可用的地区库。
 *
 * 每次调用都重新探测，**不缓存「找不到」这个结论** —— 库是运行期才落下来的，
 * 把「没有」缓存住就等于永远等不到它出现。
 */
function locate() {
  const candidates = [
    process.env.IP2REGION_XDB,
    xdbPath,
    join(projectRoot, 'vendor/ip2region_v4.xdb'),
  ]
  for (const p of candidates) if (p && existsSync(p)) return p
  return null
}

/** 惰性加载：没人在后台看访客页时不占这 11 MB */
let file = null

/** 查询缓存。地区串高度重复，缓存能省掉大量二分查找；满了整体清空，不做精细 LRU。 */
const cache = new Map()
const CACHE_MAX = 4096

function load() {
  if (file) return file
  const path = locate()
  if (!path) return null
  try {
    file = readFileSync(path)
    /*
     * 库刚到位：把此前缓存下来的 null 结论全部作废。
     * 缺库期间查过的 IP 都缓存了 null，不清掉的话「下好了刷新一下就能看到」
     * 并不成立 —— 那几个 IP 会一直显示无地区。
     */
    cache.clear()
  } catch {
    file = null
  }
  return file
}

/** 地区库是否可用。随 `/api/admin/visitors` 一同回报，供脚本与运维诊断；界面不再就此提示 */
export function geoReady() {
  return load() !== null
}

/** 下载活动状态；'ready' 一律由 load() 现场判定，不在两处各维护一份 */
let downloadState = 'absent' // 'absent' | 'downloading' | 'failed'
let lastFailAt = 0
/** 失败后的冷却：一次网络抖动不该让每次翻页都重下 11 MB，一次失败也不该就此放弃 */
const RETRY_COOLDOWN_MS = 30 * 60 * 1000

/**
 * 地区库的状态，供接口如实告诉界面「地区列为什么是空的」。
 *
 * 「正在获取」和「获取失败」对使用者是两件不同的事，含糊成一句「不可用」，
 * 会把人引去查一个根本不存在的故障。
 */
export function geoState() {
  if (load()) return 'ready'
  return downloadState
}

/**
 * 缺库时在后台拉一次 —— **不阻塞调用方**。
 *
 * 由访客列表接口触发（那是地区唯一被用到的地方），而不是服务启动时：
 * 站点刚起来就出网拉 11 MB，对没人看后台的部署是纯浪费。
 *
 * 只管触发、不等结果：本次请求照常返回（地区列空着），下次访问就有了。
 * 失败不抛给调用方，只把状态记为 failed 并静默降级 —— 少一列地区
 * 不该让整个访客列表打不开。
 */
export function ensureGeo() {
  if (downloadState === 'downloading') return
  if (load()) return
  if (downloadState === 'failed' && Date.now() - lastFailAt < RETRY_COOLDOWN_MS) return

  downloadState = 'downloading'
  fetchGeoDb(xdbPath, { log: (msg) => console.log(`[geo] ${msg}`) })
    .then(({ url, bytes }) => {
      downloadState = 'absent'
      console.log(`[geo] 地区库已就绪：${xdbPath}（${(bytes / 1e6).toFixed(1)} MB，来源 ${url}）`)
    })
    .catch((err) => {
      downloadState = 'failed'
      lastFailAt = Date.now()
      console.warn(`[geo] 地区库拉取失败：${err.message}`)
      console.warn('[geo] 访客列表的地区一列暂不可用（其余功能不受影响），30 分钟后会再试')
    })
}

/**
 * RFC1918 / 回环 / 链路本地 / CGNAT 一律短路成「内网地址」，不查库。
 *
 * 一是省一次查询，二是这些地址在库里多半命中 `Reserved` 一类的占位串，
 * 直接给个人话反而更准 —— 自托管场景里日志中的 192.168.x / 172.16.x 就是自己人。
 */
function isPrivate(v) {
  const a = (v >>> 24) & 0xff
  const b = (v >>> 16) & 0xff
  if (a === 10 || a === 127) return true
  if (a === 192 && b === 168) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 169 && b === 254) return true
  if (a === 100 && b >= 64 && b <= 127) return true
  return false
}

/** 把点分十进制或 `::ffff:1.2.3.4` 形态的地址转成 uint32；IPv6 等其他形态返回 null */
export function toUint32(ip) {
  let s = String(ip ?? '').trim()
  if (!s) return null
  // Node 在双栈监听下会把 IPv4 报成 `::ffff:1.2.3.4`
  const m = s.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i)
  if (m) s = m[1]
  if (s.includes(':')) return null

  const parts = s.split('.')
  if (parts.length !== 4) return null
  let v = 0
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null
    const n = Number(p)
    if (n > 255) return null
    v = (v * 256 + n) >>> 0
  }
  return v
}

/**
 * 查一个 IP 的地区。
 *
 * 返回 `{ private, country, province, city, isp, label }`；查不到或库缺失时返回 null。
 * `label` 是给表格直接用的短串，原始字段留着自己拼 tooltip。
 */
export function regionOf(ip) {
  const v = toUint32(ip)
  if (v === null) return null

  if (isPrivate(v)) {
    return { private: true, country: '', province: '', city: '', isp: '', label: '内网地址' }
  }

  const key = v
  const hit = cache.get(key)
  if (hit !== undefined) return hit

  const result = lookup(v)
  if (cache.size >= CACHE_MAX) cache.clear()
  cache.set(key, result)
  return result
}

function lookup(v) {
  const buf = load()
  if (!buf) return null

  // 向量索引：把 IP 的前两字节当作 256x256 的行列号，直接算出分区
  const il0 = (v >>> 24) & 0xff
  const il1 = (v >>> 16) & 0xff
  const vi = HEADER_SIZE + (il0 * 256 + il1) * 8
  if (vi + 8 > buf.length) return null

  let start = buf.readUInt32LE(vi)
  const end = buf.readUInt32LE(vi + 4)
  if (end <= start || end > buf.length) return null

  // 在分区内按 14 字节步长二分。end 是排他上界，项数由上界决定。
  let lo = 0
  let hi = Math.floor((end - start) / SEGMENT_SIZE) - 1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    const p = start + mid * SEGMENT_SIZE
    const sip = buf.readUInt32LE(p)
    if (v < sip) {
      hi = mid - 1
      continue
    }
    const eip = buf.readUInt32LE(p + 4)
    if (v > eip) {
      lo = mid + 1
      continue
    }
    const len = buf.readUInt16LE(p + 8)
    const dataPtr = buf.readUInt32LE(p + 10)
    if (len <= 0 || dataPtr + len > buf.length) return null

    const raw = buf.toString('utf8', dataPtr, dataPtr + len)
    return parseRegion(raw)
  }
  return null
}

/** 地区串形如 `中国|福建省|福州市|电信|CN`，境外数据缺的字段以 `0` 占位 */
function parseRegion(raw) {
  const f = String(raw ?? '').split('|').map((s) => s.trim())
  const pick = (i) => (f[i] && f[i] !== '0' ? f[i] : '')
  const country = pick(0)
  const province = pick(1)
  const city = pick(2)
  const isp = pick(3)

  // 库里的 `Reserved` 是「这段 IP 没分配」的占位串，不该原样出现在界面上
  if (!country || country === 'Reserved') return null

  let label
  if (country === '中国') {
    // 直辖市与部分省份的省、市同名（北京市|北京市），重复一遍反而像脏数据
    const parts = province === city ? [province] : [province, city]
    label = parts.filter(Boolean).join(' ') || '中国'
  } else {
    label = [country, city].filter(Boolean).join(' ') || '未知'
  }
  return { private: false, country, province, city, isp, label }
}
