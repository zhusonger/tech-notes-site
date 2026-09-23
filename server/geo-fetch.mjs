/**
 * ip2region 地区库的获取与校验。
 *
 * 两个调用方共用这一份实现：
 *   - `scripts/fetch-geo.mjs`：命令行，手工或 CI 预先拉好；
 *   - `server/geo.mjs`：运行期，首次有人打开访客列表时按需拉。
 * 抽出来是因为「校验规则」最容易在两边写走样，而走样了又最难发现 ——
 * 一个坏掉的库不会报错，只会让每个 IP 都查不出地区。
 *
 * 该文件约 11 MB，是一份**可重新获取的公开数据**，因此既不进版本库也不进镜像，
 * 由上面两个调用方在需要时各自获取（见 `server/geo.mjs` 的落点说明）。
 */
import { createWriteStream, existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, unlinkSync } from 'node:fs'
import { dirname } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

/**
 * 多镜像按序回退。
 *
 * 这几个源按**实测可达性**排序，不按「谁更权威」—— 开发机的 shell 可能走代理、
 * 容器默认**不继承 shell 代理**（除非在 `daemon.json` 或构建参数里显式配置），
 * 所以能用 shell 试出来的可达性不代表容器里能过。
 *
 * 实测（用 Node 的 fetch，也就是运行期的真实路径；同一台机器上两轮各测一次）：
 *   cdn.jsdelivr.net           → 206，11.1 MB / 2.5s 与 7.5s（4.4 / 1.5 MB/s）—— 最稳
 *   raw.githubusercontent.com  → 一轮 `fetch failed`、一轮超时（另有一次 92 秒勉强成功）
 *   gh-proxy.com/<raw 地址>     → 两轮都超时
 *   gitee.com/.../raw/...      → 403（GET 也是 403，不是 HEAD 限制，已剔除）
 *   raw.gitmirror.com          → DNS 解析失败；cdn.statically.io → 连接超时
 *
 * 「权威源优先」在这个场景里是把事情办坏：慢的那个排第一，快 40 倍的反而轮不到，
 * 实测 11 MB 就这样多花了一分半。所以 jsdelivr 在前，上游原站退为回退项。
 *
 * 两点实测结论，改动这里前先读：
 *   1. **不要用 content-length 做前置体积校验。** jsdelivr 以 brotli 返回
 *      （头里 4.7 MB / `content-encoding: br`），而 Node 的 fetch 会**透传解压**，
 *      最终落盘仍是 11,122,036 字节。按头里的数字判断会把一个好镜像误杀。
 *      体积校验只能做在**落盘之后**（下面的 validateGeoDb）。
 *   2. **Node 的 fetch 不读 `http_proxy` 环境变量**（curl 读，Node 不读）。
 *      所以不同路径的实际表现可能完全不一样，排序与超时都得用 Node 实测。
 */
export const MIRRORS = [
  'https://cdn.jsdelivr.net/gh/lionsoul2014/ip2region@master/data/ip2region_v4.xdb',
  'https://raw.githubusercontent.com/lionsoul2014/ip2region/master/data/ip2region_v4.xdb',
  'https://gh-proxy.com/https://raw.githubusercontent.com/lionsoul2014/ip2region/master/data/ip2region_v4.xdb',
]

/** 官方 IPv4 xdb 约 11.1 MB；给 10 MB 下限，足够挡掉半截文件与错误页 */
const MIN_SIZE = 10 * 1024 * 1024
const HEADER_SIZE = 256
const VECTOR_START = 256
/** 向量索引占 512 KiB，地区信息段从它之后开始 —— 首项指针不可能落在这个之前 */
const VECTOR_INDEX_END = HEADER_SIZE + 512 * 1024

/**
 * 结构自检。
 *
 * 只做结构判断（体积下限 + 向量索引首项指针落在文件内），**不比对官方哈希** ——
 * 上游每次更新数据都会改哈希，硬编码哈希之后上游一更新就会误报成「文件损坏」，
 * 反倒逼人把校验关掉。能排除的是「下到一半」「下到 HTML 错误页」这类最常见的坏文件。
 *
 * @returns {string|null} null 表示通过，否则是一句人话的原因
 */
export function validateGeoDb(file) {
  if (!existsSync(file)) return '文件不存在'
  const size = statSync(file).size
  if (size < MIN_SIZE) return `体积过小（${size} 字节）`

  const fh = readFileSync(file)
  // 向量索引首项 = 第一个分区（0.0.x.x）的索引起点，必须落在索引段之后、文件之内
  const ptr = fh.readUInt32LE(VECTOR_START)
  if (ptr < VECTOR_INDEX_END || ptr >= fh.length) {
    return `向量索引指针越界（${ptr}，文件 ${fh.length} 字节）—— 多半下到了错误页或半截文件`
  }
  return null
}

async function download(url, target) {
  const res = await fetch(url, {
    redirect: 'follow',
    /*
     * 60 秒覆盖到约 0.19 MB/s —— 实测最快的源只要几秒，这个下限已相当宽容。
     * 再往上调只会让「所有源都不可用」时多等：运行期下载是有人正在等着的，
     * 超时该按「多快能确定这个源不行」定，而不是按「理论上最多允许多久」。
     */
    signal: AbortSignal.timeout(60_000),
    headers: { 'User-Agent': 'tech-notes-site/fetch-geo' },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  if (!res.body) throw new Error('响应无正文')

  // 先写临时文件再改名：中途失败不会留下一个「看起来存在」的半截库，
  // 否则下次的幂等判断会把它当成已有的好文件直接跳过。
  const tmp = `${target}.part`
  try {
    await pipeline(Readable.fromWeb(res.body), createWriteStream(tmp))
    renameSync(tmp, target)
  } catch (err) {
    if (existsSync(tmp)) unlinkSync(tmp)
    throw err
  }
}

/**
 * 按序尝试所有镜像，成功即返回；全部失败时抛错（附最后一个原因）。
 *
 * 校验放在落盘之后 —— 只有在文件真的写下来之后，才知道它是不是完整的
 * （原因见上方关于 content-length 的说明）。
 *
 * @param {string} target 落点文件（目录会自动创建）
 * @param {{ log?: (msg: string) => void }} [opts]
 * @returns {Promise<{ url: string, bytes: number }>}
 */
export async function fetchGeoDb(target, { log = () => {} } = {}) {
  mkdirSync(dirname(target), { recursive: true })

  let lastErr = null
  for (const url of MIRRORS) {
    log(`拉取 ${url}`)
    try {
      await download(url, target)
      const bad = validateGeoDb(target)
      if (bad) {
        // 坏文件不能留在落点上：留着就等于给下一次「幂等跳过」发了一张通行证
        rmSync(target, { force: true })
        throw new Error(`校验未通过：${bad}`)
      }
      return { url, bytes: statSync(target).size }
    } catch (err) {
      lastErr = err
      log(`  失败：${err.message}`)
    }
  }
  throw new Error(`所有镜像均不可用（最后一个错误：${lastErr?.message}）`)
}
