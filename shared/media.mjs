/**
 * 媒体库的**上传策略与类型分组**。
 *
 * 为什么放在 shared/ 而不是 server/：界面上那句「PNG / JPG / … · ≤ 5MB」是设计的一部分，
 * 服务端拒收用的也是同一份白名单。两处各写一遍，改一处就会开始说谎 ——
 * 界面上写着能传，实际传上去被拒；或者反过来，悄悄放行了没在提示里写过的类型。
 * 所以提示文案不手写，由白名单派生。
 *
 * 这一份只放**常量与判定**，不放任何 fs / db 操作：它要能在浏览器里跑。
 */

/** 单文件上限。`express.raw({ limit })` 与界面提示都由它派生。 */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024

/**
 * 允许上传的 MIME → 落盘扩展名。
 *
 * 挡在入口而不是靠事后再消毒：仓库里没有图形处理依赖，也没有 SVG 消毒器，
 * 所以只收浏览器能安全作为 `<img>` 渲染的类型。落盘扩展名取自 MIME 而非
 * 上传时的原始文件名 —— 后者是客户端说了算的，直接拼进路径等于让访客决定写什么文件。
 */
export const UPLOAD_TYPES = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
}

/** `<input type="file">` 的 `accept`。 */
export const UPLOAD_ACCEPT = Object.keys(UPLOAD_TYPES).join(',')

/** 界面上的限制说明。由白名单与实际上限拼出来，不另写一份。 */
export const UPLOAD_HINT = `${[...new Set(Object.values(UPLOAD_TYPES))]
  .map((ext) => ext.toUpperCase())
  .join(' / ')} · ≤ ${MAX_UPLOAD_BYTES / 1024 / 1024}MB`

/** 字节数转人话。服务端算「已占用」与详情面板用的是同一个函数，口径不会走岔。 */
export function formatBytes(bytes) {
  const n = Number(bytes)
  if (!Number.isFinite(n) || n < 0) return '不可读取'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

/**
 * 类型分组。设计稿把媒体分成图片 / 图标 / 文档三组。
 *
 * 判定只看 MIME 与扩展名，不做内容嗅探：上传口已经按白名单卡过一遍，
 * 这里的职责只是分组展示。`文档` 目前恒为 0 —— 上传只收图片，
 * 保留这个桶是为了不把「当时没有的东西」写死成没有。
 */
export const MEDIA_KINDS = [
  { key: 'image', label: '图片' },
  { key: 'icon', label: '图标' },
  { key: 'doc', label: '文档' },
]

/**
 * 媒体文件按**来源**分成三档 —— 它决定「这条记录删得掉吗」。
 *
 * 后台的删除不只是删掉库里那一行，还要把磁盘上的文件一并 unlink。但并非每一条登记
 * 都有「可以删的文件」：
 *
 *   - `upload`：后台上传落进 `data/uploads`（持久卷），删了就是真没了。
 *   - `build` ：随构建产物发布（`public/images` → `dist/images`），文件本体在版本库里。
 *               运行期把它 unlink 掉，下次构建 / 部署会从仓库原样拷回来 ——
 *               「已删除」这句话会在下次发版时变成谎话，所以这一档明确**不可删**，
 *               界面上把删除入口关掉并说明理由，而不是让人点完再发现文件回来了。
 *   - `other`：地址不在两个受管前缀里，磁盘上没有对应文件，删除只是移除登记项。
 *
 * 判定只看 URL 前缀，**不查文件是否存在**：一个「文件暂时不在盘上」的上传件
 * 不该因为一次误读被判成不可删。
 *
 * 放 shared/ 的理由与上传白名单相同：界面上那句「随构建发布」与服务端拒收时
 * 给出的理由必须是同一句话，两处各写一遍迟早会说岔。
 */
export const MEDIA_ORIGINS = {
  upload: { label: '后台上传', removable: true, hint: null },
  build: {
    label: '随构建发布',
    removable: false,
    hint: '文件随构建产物发布、本体在版本库里，运行期删掉会在下次构建时回来',
  },
  other: { label: '外部地址', removable: true, hint: null },
}

const ICON_MIME = ['image/svg+xml', 'image/x-icon', 'image/vnd.microsoft.icon']
const DOC_MIME = ['application/pdf', 'application/zip', 'application/json', 'text/plain', 'text/markdown']

export function mediaKindOf(mime, filename) {
  const m = String(mime ?? '').toLowerCase().split(';')[0].trim()
  const ext = String(filename ?? '').toLowerCase().split('.').pop() ?? ''
  if (ICON_MIME.includes(m) || ext === 'svg' || ext === 'ico') return 'icon'
  if (m.startsWith('image/')) return 'image'
  if (DOC_MIME.includes(m)) return 'doc'
  // 既不是位图也不是矢量图标的都归「文档」。库里目前只可能出现上传白名单里的前两类，
  // 所以这一支实际只在手工插库时才会走到。
  return 'doc'
}

/** 替代文本上限。与 `server/media.mjs` 的校验同源。 */
export const MAX_ALT_LENGTH = 120
