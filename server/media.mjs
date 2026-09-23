/**
 * 媒体库：列表 / 上传 / 改信息 / 删除。
 *
 * 三件事在这一层定死，因为它们都是「不查一遍就不敢回答」的问题：
 *
 * 1. **文件多大，以磁盘为准，不以库为准。** `media.bytes` 是上传时记下的快照；
 *    手工放进 `public/images` 的种子行根本没有这个数（写入时是 0）。
 *    列表要是直接读那一列，界面就会对着一堆真实存在的图片说「0 B」。
 * 2. **能不能删，取决于有没有人引用。** 引用关系散在文章封面、文章正文、
 *    站点设置与结构化区块四处，没有任何一张表记得住它。删除前必须现扫一遍 ——
 *    删掉一张还在被首页引用的图，前台会出现一个裂图，而库里看不出任何异常。
 * 3. **落盘路径只从两个根长出来。** `url` 是库里的字符串，谁写进去的都有可能；
 *    拿它直接做 `readFileSync` 的入参等于把「写库」升级成了「读任意文件」。
 *    所以只认 `/uploads/` 与 `/images/` 两个前缀，其余一律当作没有磁盘副本。
 * 4. **能不能删文件，取决于这条记录是从哪来的。** 上传件在持久卷上，删了就是真没了；
 *    随构建发布的素材本体在版本库里，运行期 unlink 只会在下次构建时被拷回来。
 *    所以「可删」是一条由来源决定的策略（`MEDIA_ORIGINS`），删除前先问它 ——
 *    单条删除与批量删除走的是同一个判定，不会出现「单条拦下、批量放过」。
 */
import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import { all, distDir, get, nowIso, projectRoot, run } from './db.mjs'
import { readSettings } from './settings.mjs'
import { SECTION_SPECS } from '../shared/sections.mjs'
import { MAX_ALT_LENGTH, MAX_UPLOAD_BYTES, MEDIA_ORIGINS, UPLOAD_ACCEPT, UPLOAD_HINT, UPLOAD_TYPES, formatBytes, mediaKindOf } from '../shared/media.mjs'

/**
 * 界面需要照着它做事的那几条策略，随列表一起下发。
 * 前端各存一份的后果是「界面上写着能传，实际被拒」—— 所以上传白名单、
 * 体积上限、替代文本上限只有这一处声明，两个界面都读它。
 * `origins` 同理，只是它约束的是**删除**：哪一档删得掉、删不掉时说什么话，
 * 界面与拒收读的是同一份。
 */
export const MEDIA_POLICY = {
  accept: UPLOAD_ACCEPT,
  hint: UPLOAD_HINT,
  maxBytes: MAX_UPLOAD_BYTES,
  maxAlt: MAX_ALT_LENGTH,
  origins: MEDIA_ORIGINS,
}

export const UPLOAD_DIR = process.env.UPLOAD_DIR ?? resolve(projectRoot, 'data/uploads')
export const UPLOAD_URL_PREFIX = '/uploads'
const PUBLIC_IMAGE_PREFIX = '/images/'

/** 上传落盘先建目录。放在保存时而不是启动时：没传过东西就不该凭空造一个空目录。 */
function ensureUploadDir() {
  if (!existsSync(UPLOAD_DIR)) mkdirSync(UPLOAD_DIR, { recursive: true })
}

// ------------------------------------------------------------------ 磁盘

/**
 * `url` → 磁盘路径。只认两个根，别的一律返回 null。
 * `basename` 是必须的：`/uploads/../../etc/passwd` 拼出来会跳出目录。
 */
export function diskPathOf(url) {
  const u = String(url ?? '')
  if (u.startsWith(`${UPLOAD_URL_PREFIX}/`)) return join(UPLOAD_DIR, basename(u))
  if (u.startsWith(PUBLIC_IMAGE_PREFIX)) return join(distDir, 'images', basename(u))
  return null
}

/** `url` 属于哪一档来源（见 `shared/media.mjs` 的 `MEDIA_ORIGINS`）。 */
export function originOf(url) {
  const u = String(url ?? '')
  if (u.startsWith(`${UPLOAD_URL_PREFIX}/`)) return 'upload'
  if (u.startsWith(PUBLIC_IMAGE_PREFIX)) return 'build'
  return 'other'
}

/** 真实字节数。读不到磁盘时退回库里那一列（可能也是 0，但那是当时的事实）。 */
function bytesOf(row) {
  const path = diskPathOf(row.url)
  if (path) {
    try {
      const st = statSync(path)
      if (st.isFile()) return st.size
    } catch {
      /* 文件不在磁盘上 —— 行还在，图没了。下面的尺寸/格式仍照常展示，让这条能被人看见 */
    }
  }
  return Number(row.bytes) || 0
}

export function mediaOnDisk(row) {
  const path = diskPathOf(row.url)
  if (!path) return false
  try {
    return statSync(path).isFile()
  } catch {
    return false
  }
}

/**
 * 尺寸只对 PNG 生效 —— 且只用系统里唯一那种「8 字节签名 + IHDR」的读法。
 * 就为了一个 `1440 × 900` 的展示位去引一个图形库不划算：本库的媒体几乎全是 PNG 封面，
 * 而 PNG 的 IHDR 偏移是固定的。JPEG / WebP / SVG 一律留空，界面显示「—」，
 * 不猜一个看起来像真的数字。
 */
function pngSize(path) {
  try {
    // 只需前 24 字节，但 fs 没有同步读前缀的 API；媒体库里都是几百 KB 级的图，
    // 读整个文件在列表接口里也只是一次顺序读，不值得为它引依赖
    const buf = readFileSync(path).subarray(0, 24)
    if (buf.length < 24 || buf.readUInt32BE(0) !== 0x89504e47) return null
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }
  } catch {
    return null
  }
}

// ------------------------------------------------------------------ 引用

/** 设置项的 key → 中文名。从设置分组现取，不另抄一份。 */
function settingLabels() {
  const map = new Map()
  try {
    const { groups } = readSettings()
    for (const g of groups) for (const f of g.fields ?? []) map.set(f.key, f.label)
  } catch {
    /* 设置读不出来不该让媒体列表一起打不开 —— 只是标签退化成 key */
  }
  return map
}

/**
 * 一张图被谁引用。
 *
 * 匹配用的是**完整 url**（`/images/hero-workspace.png`）而不是文件名：正文里写的就是 url，
 * 而裸文件名太短，`portrait.png` 这种会在一堆无关文本里误命中。
 *
 * 列表页有 N 张图，逐张去扫四个数据源就是 4N 次全表读。所以这里做成
 * 「扫一次 → 返回一个按 url 查的函数」，列表与详情共用同一条路径，
 * 免得为了性能再写一份只在列表里生效的判定（两份判定迟早会不一致）。
 */
export function referenceIndex() {
  const posts = all('SELECT id, title, cover_image, body, status FROM posts')
  const settings = all('SELECT key, value FROM site_settings')
  const sections = all('SELECT key, data FROM site_sections')
  const labels = settingLabels()

  return (url) => {
    const needle = String(url ?? '')
    if (!needle) return []
    const hit = (text) => typeof text === 'string' && text.includes(needle)
    const out = []

    for (const p of posts) {
      if (hit(p.cover_image) || hit(p.body)) {
        out.push({
          type: 'post',
          id: p.id,
          label: `《${p.title}》`,
          // 草稿要标出来：前台看不到它，但删图照样会把它改坏
          note: p.status === 'published' ? null : '草稿',
          href: `/admin/posts/${p.id}`,
        })
      }
    }

    for (const s of settings) {
      if (hit(s.value)) {
        out.push({
          type: 'settings',
          id: s.key,
          label: labels.get(s.key) ?? s.key,
          note: null,
          href: '/admin/settings',
        })
      }
    }

    for (const sec of sections) {
      if (hit(sec.data)) {
        const spec = SECTION_SPECS[sec.key]
        out.push({
          type: 'section',
          id: sec.key,
          label: spec ? `首页 · ${spec.label}` : sec.key,
          note: null,
          // 区块属于哪个模块就去哪一屏改 —— 路由名与模块名同源，不另维护一张表
          href: spec ? `/admin/${spec.module}` : '/admin/home',
        })
      }
    }

    return out
  }
}

export const referencesOf = (row) => referenceIndex()(row.url)

// ------------------------------------------------------------------ 删除判定

/**
 * 这一条**能不能删**，不能删时说清为什么。返回 null 表示可以删。
 *
 * 做成一个共用函数而不是在两条删除路径里各写一遍，是因为它同时约束三件事：
 * 单条删除的 409、批量删除里的跳过清单、界面上的禁用状态。这三处只要有一处
 * 口径不同，就会出现「界面上删得动、接口拒收」或者反过来「界面上拦着、批量能绕过去」。
 *
 * 两条拒绝理由的**顺序**是有意的：先看来源，再看引用。删不掉的素材（随构建发布）
 * 无论被引用几次都删不掉，先报引用数会让人以为「把那几处引用清掉就能删了」。
 */
export function mediaDeleteBlock(row, refs) {
  const origin = MEDIA_ORIGINS[originOf(row.url)]
  if (!origin.removable) return `「${row.filename}」${origin.hint ?? '不可删除'}`
  if (refs.length) {
    return `「${row.filename}」正被 ${refs.length} 处引用，删掉会让它们显示裂图`
  }
  return null
}

// ------------------------------------------------------------------ 读

const MEDIA_SORTS = {
  recent: (a, b) => b.createdAt.localeCompare(a.createdAt) || b.id - a.id,
  oldest: (a, b) => a.createdAt.localeCompare(b.createdAt) || a.id - b.id,
  name: (a, b) => a.filename.localeCompare(b.filename, 'en') || a.id - b.id,
  size: (a, b) => b.bytes - a.bytes || b.id - a.id,
}

export const MEDIA_SORT_OPTIONS = [
  { value: 'recent', label: '最近上传' },
  { value: 'oldest', label: '最早上传' },
  { value: 'name', label: '按文件名' },
  { value: 'size', label: '按大小' },
]

function asMediaItem(row, lookup) {
  const kind = mediaKindOf(row.mime, row.filename)
  const bytes = bytesOf(row)
  const disk = diskPathOf(row.url)
  const size = disk ? pngSize(disk) : null
  const refs = lookup(row.url)
  return {
    id: row.id,
    filename: row.filename,
    url: row.url,
    mime: row.mime,
    kind,
    /** 来源决定「删得掉吗」。界面上的徽标与删除按钮的禁用状态都读它 */
    origin: originOf(row.url),
    bytes,
    bytesLabel: formatBytes(bytes),
    width: size?.width ?? row.width ?? null,
    height: size?.height ?? row.height ?? null,
    alt: row.alt ?? '',
    createdAt: row.created_at,
    missing: !mediaOnDisk(row),
    references: refs,
    referenceCount: refs.length,
  }
}

/** 列表以外的路径（改完信息回读一行）用这个，省得调用方自己拼 lookups。 */
export function mediaItemOf(row) {
  return asMediaItem(row, referenceIndex())
}

/**
 * 列表。
 *
 * **排序在 JS 里做，不下推给 SQL。** 因为「大小」排的是磁盘上的真实字节数
 * （见 `bytesOf`），而 `media.bytes` 对这一列来说只是上传时的快照 —— 手工放进
 * `public/images` 的种子行是 0。按 SQL 排会让「按大小」把一堆真实存在的图
 * 当成同样大，点下去看着像没反应。排序口径必须与界面显示的口径是同一个。
 *
 * 媒体库是几十到几百条的规模，一次全读进内存再排，代价可以忽略。
 * `sort` 仍然只从闭集里取，未知值退回默认。
 */
export function readMediaAdmin({ kind = '', sort = 'recent' } = {}) {
  const key = MEDIA_SORTS[sort] ? sort : 'recent'
  const lookup = referenceIndex()
  const items = all('SELECT * FROM media').map((row) => asMediaItem(row, lookup))
  items.sort(MEDIA_SORTS[key])
  const filtered = kind ? items.filter((i) => i.kind === kind) : items
  return { items: filtered, sort: key, kind }
}

/** 各分组的真实计数 + 总占用。数字全部现场算，没有一处是估计出来的。 */
export function mediaFacets() {
  const rows = all('SELECT * FROM media')
  const counts = { all: rows.length, image: 0, icon: 0, doc: 0 }
  let bytes = 0
  let missing = 0
  for (const row of rows) {
    counts[mediaKindOf(row.mime, row.filename)] += 1
    bytes += bytesOf(row)
    if (!mediaOnDisk(row)) missing += 1
  }
  return {
    counts,
    bytes,
    bytesLabel: formatBytes(bytes),
    missing,
    /** 界面上「共 N 个文件 · 已用 X」直接读这两项，不各自拼字符串 */
    totalLabel: rows.length ? `${rows.length} 个文件 · ${formatBytes(bytes)}` : '还没有文件',
  }
}

// ------------------------------------------------------------------ 校验

/**
 * 改信息目前只放行替代文本。
 *
 * 文件名与地址都不接受修改：它们是磁盘路径与所有引用的锚点，改一次得同时
 * 重命名文件、改库、再回写四处引用；漏掉任何一处，前台就是一张裂图。
 * 与其做一个只改一半的「重命名」，不如明确拒收 —— 界面上的文件名因此是只读的，
 * 两边说的是同一句话。
 */
export function validateMediaPayload(body) {
  const src = body && typeof body === 'object' ? body : {}
  const unknown = Object.keys(src).filter((k) => k !== 'alt')
  if (unknown.length) {
    const name = unknown[0]
    const reason =
      name === 'filename' || name === 'url'
        ? '文件名与地址不可修改：它们是磁盘路径与所有引用的锚点'
        : `字段「${name}」不可修改`
    return { error: reason }
  }
  if (src.alt === undefined) return { error: '没有需要保存的改动' }
  const alt = String(src.alt ?? '').trim()
  if (alt.length > MAX_ALT_LENGTH) {
    return { error: `替代文本最多 ${MAX_ALT_LENGTH} 字，当前 ${alt.length} 字` }
  }
  return { values: { alt } }
}

// ------------------------------------------------------------------ 写

/** 原始文件名 → 落盘的 ASCII 短名。中文名在这里会被削光，所以必须留兜底。 */
function fileStem(originalName, mime) {
  const raw = String(originalName ?? '').split(/[\\/]/).pop() ?? ''
  const withoutExt = raw.replace(/\.[^.]+$/, '')
  const stem = withoutExt
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
  // 扩展名取自 MIME，不取原始文件名 —— 后者是客户端说了算的
  const ext = UPLOAD_TYPES[mime]
  return `${stem || 'asset'}-${randomBytes(3).toString('hex')}.${ext}`
}

/**
 * 存一次上传。
 *
 * MIME 以请求头为准而不是猜原始扩展名：iOS 相册里导出的 HEIC 常常顶着 `.jpg` 的名字，
 * 按名字放行会把一个打不开的文件写进媒体库。类型不在白名单里就直接拒 —— 没有
 * 「先存下来再想办法」这一步。
 */
export function saveUpload({ buffer, originalName, mime }) {
  const type = String(mime ?? '').split(';')[0].trim().toLowerCase()
  if (!UPLOAD_TYPES[type]) {
    return { error: `不支持的类型「${type || '未知'}」，只收 ${Object.keys(UPLOAD_TYPES).join(' / ')}` }
  }
  if (!buffer?.length) return { error: '文件内容为空' }

  ensureUploadDir()
  const filename = fileStem(originalName, type)
  writeFileSync(join(UPLOAD_DIR, filename), buffer)

  const url = `${UPLOAD_URL_PREFIX}/${filename}`
  /* 替代文本预填成原名（去掉扩展名）：绝大多数图传上来就只缺这一项，
     预填一个能用的值比留空更接近「拖完就能用」 */
  const fallbackAlt = String(originalName ?? '')
    .split(/[\\/]/)
    .pop()
    ?.replace(/\.[^.]+$/, '')
    .slice(0, MAX_ALT_LENGTH)

  const info = run(
    'INSERT INTO media (filename, url, mime, bytes, alt, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    filename,
    url,
    type,
    buffer.length,
    fallbackAlt ?? '',
    nowIso()
  )

  return { row: mediaItemOf(get('SELECT * FROM media WHERE id = ?', Number(info.lastInsertRowid))) }
}

/**
 * 删磁盘上的副本。只删自己传的（`data/uploads`）；随构建发布的素材不在可删范围里，
 * 理由见 `MEDIA_ORIGINS.build`。`other` 档本来就没有磁盘副本，无事可做。
 *
 * 文件已经不在了也算成功：这一层的目标是「删完之后库与磁盘一致」，
 * 而那种情况下它已经一致了。报一句「文件没能删掉，请手动清理」只会让人
 * 去找一个本来就不存在的文件。
 */
export function removeMediaFile(row) {
  const origin = originOf(row.url)
  /* `other` 档本来就没有磁盘副本，删完即一致。`build` 档走到这里说明调用方漏了
     那道来源判定 —— 返回 false 让界面上照实报「文件没删掉」，而不是假装成功。 */
  if (origin === 'other') return true
  if (origin === 'build') return false
  const path = diskPathOf(row.url)
  try {
    unlinkSync(path)
    return true
  } catch (err) {
    return err?.code === 'ENOENT'
  }
}
