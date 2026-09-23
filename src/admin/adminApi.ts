/**
 * 后台 API 客户端。
 *
 * 全部走同源 `/api`（开发态由 Vite 代理到本地服务端），
 * 会话是 httpOnly Cookie，因此这里不需要、也拿不到任何 token。
 */

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

/** 响应 → 载荷（或抛出 `ApiError`）。上传那条路径绕开了 `request`，但错误口径必须一致。 */
async function parseResponse<T>(res: Response): Promise<T> {
  const text = await res.text()
  let payload: unknown = null
  if (text) {
    try {
      payload = JSON.parse(text)
    } catch {
      payload = null
    }
  }

  if (!res.ok) {
    const message =
      (payload as { error?: string } | null)?.error ??
      (res.status === 404 ? '接口不存在' : `请求失败（HTTP ${res.status}）`)
    throw new ApiError(message, res.status)
  }
  return payload as T
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'same-origin',
    })
  } catch {
    throw new ApiError('无法连接服务端，请确认后台服务已启动', 0)
  }

  return parseResponse<T>(res)
}

export interface AdminUser {
  id: number
  email: string
  displayName: string
  role: string
  avatarUrl: string | null
  mustChangePassword: boolean
}

export interface LoginCredentials {
  email: string
  password: string
  remember: boolean
}

export type LoginResult =
  | { stage: '2fa'; ticket: string }
  | { stage: 'done'; user: AdminUser; twoFactorEnabled: boolean; recoveryWarning?: boolean }

export interface TwoFactorStatus {
  enabled: boolean
  deviceLabel: string | null
  confirmedAt: string | null
  recovery: { total: number; remaining: number }
}

export interface TwoFactorSetup {
  secret: string
  otpauth: string
  qrDataUrl: string
}

export interface SessionRow {
  id: number
  current: boolean
  remember: boolean
  userAgent: string
  ip: string
  createdAt: string
  lastSeenAt: string
  expiresAt: string
}

export type PostStatus = 'published' | 'draft' | 'trash'

/** 列表页签比状态多一个「全部」。 */
export type PostFilterStatus = 'all' | PostStatus

export type PostSortKey = 'updated' | 'created' | 'views'

export interface PostListItem {
  id: number
  slug: string
  title: string
  category: string
  excerpt: string
  status: PostStatus
  views: number
  readingTime: string
  coverImage: string | null
  publishedAt: string | null
  createdAt: string
  updatedAt: string
  /** 服务端按画布口径拼好的时间标签：今天 / 昨天 / MM-DD HH:mm */
  updatedLabel: string
}

export interface PostCounts {
  all: number
  published: number
  draft: number
  trash: number
}

export interface PostListQuery {
  status?: PostFilterStatus
  category?: string
  sort?: PostSortKey
  page?: number
  perPage?: number
}

export interface PostListResponse {
  items: PostListItem[]
  counts: PostCounts
  page: number
  perPage: number
  total: number
  totalPages: number
}

/**
 * 编辑器取到的单篇：比列表项多正文、SEO 描述与标签关联。
 * 这三样在列表里用不到，若并进列表项，列表每行都要白背一份正文。
 */
export interface PostDetail extends PostListItem {
  body: string
  seoDescription: string
  tags: string[]
  /** 服务端拼好的 'YYYY-MM-DD HH:mm'；未发布时是空串 */
  publishedAtLabel: string
}

export interface PostDetailResponse {
  post: PostDetail
  /** 分类下拉的选项来自 `categories` 表，不是从已发布文章里现推的 */
  categories: string[]
  /** 标签输入的建议项：库中已有的全部标签 */
  allTags: string[]
  author: string
}

/** 只有这里列出的字段可写。`status` 不在其中，它走列表页那条独立分支。 */
export interface PostSavePayload {
  title?: string
  slug?: string
  excerpt?: string
  category?: string
  body?: string
  tags?: string[]
  seoDescription?: string | null
  coverImage?: string | null
}

export interface PostSaveResponse {
  post: PostDetail
  changed: boolean
  /** 服务端改动的字段中文名，用于「已保存：标题、正文」这类回执 */
  fields?: string[]
  counts?: PostCounts
}

export interface CategoryItem {
  id: number
  name: string
  slug: string
  description: string
  sortOrder: number
  createdAt: string
  postCount: number
}

/* ------------------------------------------------------------- 分类与标签 */

export interface TagItem {
  id: number
  name: string
  slug: string
  createdAt: string
  /** 有多少篇文章挂着它。合并时用它排序，也是标签云里那个数字 */
  postCount: number
}

/** 近重复分组里的一条。`count` 是它的文章数，用来决定谁被留下。 */
export interface MergeMember {
  id: number
  name: string
  count: number
}

/**
 * 一组近重复标签：`keeper` 保留，`drop` 并进它。
 *
 * 分组由服务端算（`shared/taxonomy.mjs`），前端只负责摆出来给人看 ——
 * 这是一次会删数据的操作，判定必须只有一处。
 */
export interface MergeGroup {
  key: string
  keeper: MergeMember
  drop: MergeMember[]
  /** 服务端拼好的一句话。确认弹层与操作日志用的是同一句 */
  text: string
}

export interface TaxonomyCounts {
  categories: number
  tags: number
  unusedTags: number
  uncategorized: number
}

/** 三处副标题上的数：一次改完就刷新，不再为每个动作各取一遍。 */
export interface TaxonomyFacets {
  counts: TaxonomyCounts
}

export interface TaxonomyResponse extends TaxonomyFacets {
  categories: CategoryItem[]
  tags: TagItem[]
  /** 名字上限来自服务端：输入框上的计数提示与后端拒收读的是同一份 */
  policy: { categoryNameMax: number; tagNameMax: number }
  /** 没有近重复时是空数组 —— 「合并重复标签」据此如实置灰 */
  mergeGroups: MergeGroup[]
}

export interface CategorySaveResponse extends TaxonomyFacets {
  item: CategoryItem
  /** 只用于重命名：留空表示这次没动任何东西 */
  changed?: boolean
  /** 重命名连带改了多少篇文章的 `posts.category` */
  movedPosts?: number
}

export interface CategoryDeleteResponse extends TaxonomyFacets {
  deleted: true
  id: number
  /** 被解绑（变成「未分类」）的文章数 */
  unbound: number
}

export interface TagSaveResponse extends TaxonomyFacets {
  item: TagItem
  changed?: boolean
}

export interface TagDeleteResponse extends TaxonomyFacets {
  deleted: true
  id: number
  /** 被解除的关联数。文章本身不受影响 */
  unbound: number
}

export interface TagPruneResponse extends TaxonomyFacets {
  removed: number
  names: string[]
}

export interface TagMergeResponse extends TaxonomyFacets {
  merged: number
  groups: MergeGroup[]
  movedPosts?: number
  renamed: number
}

/* ------------------------------------------------------------------ 项目 */

/** 项目只有两态：在前台挂着，或者先收起来。它没有文章那样的回收站。 */
export type ProjectStatus = 'published' | 'draft'

/** 「按排序权重」是拖拽排出来的顺序；另两个是只读的观察角度，都不能拖。 */
export type ProjectSortKey = 'order' | 'stars' | 'updated'

export interface ProjectItem {
  id: number
  slug: string
  title: string
  description: string
  tags: string
  language: string
  stars: number
  forks: number
  repoUrl: string
  featured: boolean
  status: ProjectStatus
  sortOrder: number
  createdAt: string
  updatedAt: string
  updatedLabel: string
}

export interface ProjectFacets {
  /**
   * 副标题上的三个数说的是「一共多少」，不随筛选变小 ——
   * 所以它们与 `items` 无关，任何时候都能照常显示。
   */
  counts: { all: number; featured: number; stars: number; starsLabel: string }
  /** 语言筛选条。按项目数降序，与画布上的排法一致。 */
  languages: { name: string; count: number }[]
}

export interface ProjectListResponse extends ProjectFacets {
  items: ProjectItem[]
  sort: ProjectSortKey
  language: string
}

export interface ProjectSavePayload {
  title?: string
  slug?: string
  description?: string
  tags?: string
  language?: string
  stars?: number
  forks?: number
  repoUrl?: string | null
  featured?: boolean
  status?: ProjectStatus
}

export interface ProjectSaveResponse extends ProjectFacets {
  project: ProjectItem
  changed?: boolean
  /** 服务端改动的字段中文名，用于「已保存：名称、Stars」这类回执 */
  fields?: string[]
}

export interface DashboardData {
  range: number
  updatedAt: string
  kpis: {
    published: { value: number; delta: string }
    views: { value: number }
    drafts: { value: number }
    visitors: { value: number; deltaText: string }
  }
  trend: { day: string; full: string; value: number }[]
  distribution: { total: number; rows: { name: string; count: number }[] }
  recentEdits: { id: number; title: string; category: string; status: PostStatus; updatedAt: string }[]
  todos: { title: string; meta: string }[]
  weekly: { done: number; target: number }
}

export type AuditResult = 'all' | 'success' | 'failed'

export interface AuditLogRow {
  id: number
  at: string
  /** 已经按「今天 / 昨天 / MM-DD」口径拼好，前端不再二次格式化 */
  atLabel: string
  actor: string
  /** 'system' 表示没有真人操作者（如首次启动建账号），视觉上要与真人区分 */
  actorKind: 'user' | 'system'
  action: string
  /** false 表示服务端动作目录里还没登记这个码，文本会回退成原始码 */
  actionKnown: boolean
  /** 服务端把动作码翻译好的中文句式 */
  text: string
  targetType: string | null
  targetId: string | null
  result: 'success' | 'failed'
  ip: string | null
}

export interface AuditLogResponse {
  items: AuditLogRow[]
  counts: { all: number; success: number; failed: number }
  actors: { value: string; count: number }[]
  range: number
  result: AuditResult
  actor: string
  total: number
  page: number
  perPage: number
  totalPages: number
  retentionDays: number
  /** 超出保留期、等待清理的条数 */
  expired: number
}

export interface AuditLogQuery {
  result?: AuditResult
  range?: number
  actor?: string
  page?: number
  perPage?: number
}

/** 来源地区的解析结果；整体为 null 表示离线库缺失，或该地址不属于可解析范围（如纯 IPv6） */
export interface VisitorRegion {
  /** true = RFC1918 / 回环 / 链路本地等内网地址，服务端已短路，不含省市字段 */
  private: boolean
  country: string
  province: string
  city: string
  isp: string
  /** 可直接上屏的短串，如「浙江省 杭州市」 */
  label: string
}

export interface VisitorDevice {
  kind: 'mobile' | 'tablet' | 'desktop' | 'bot' | 'unknown'
  os: string
  browser: string
  /** 可直接上屏的短串，如「Chrome · macOS」 */
  label: string
}

export interface VisitorRow {
  ip: string
  region: VisitorRegion | null
  device: VisitorDevice
  /** 该访客的浏览页数 */
  views: number
  /** 有访问记录的天数 */
  days: number
  firstAt: string
  /** 已按「今天 / 昨天 / MM-DD HH:mm」口径拼好，前端不再二次格式化 */
  firstLabel: string
  lastAt: string
  lastLabel: string
}

/**
 * 离线地区库的状态（由服务端判定）。
 *
 * 库不随镜像分发 —— 首次访问访客列表时由服务端在后台补上，所以「正在获取」
 * 与「获取失败」对使用者是两件不同的事：前者等一下刷新就有，后者不是干等。
 */
export type GeoState = 'ready' | 'downloading' | 'failed' | 'absent'

export interface VisitorResponse {
  items: VisitorRow[]
  /** 独立访客数（按 IP 聚合后的行数），分页依据 */
  total: number
  /** 总浏览数，与 total 不是一回事 */
  views: number
  page: number
  perPage: number
  totalPages: number
  range: number
  keyword: string
  retentionDays: number
  /** false 表示离线地区库暂不可用，界面应如实说明，而不是把每个 IP 都标成未知 */
  geoReady: boolean
  /**
   * 为什么不可用。库不随镜像分发，首次访问这一页时由服务端在后台补上 ——
   * 「正在获取」（等一下刷新就有）与「获取失败」（不是干等）必须分开说，
   * 否则使用者会去查一个根本不存在的故障。
   */
  geoState: GeoState
}

export interface VisitorQuery {
  range?: number
  keyword?: string
  page?: number
  perPage?: number
}

export type SettingFieldType = 'text' | 'textarea' | 'select' | 'switch' | 'number' | 'url' | 'readonly'

export interface SettingField {
  key: string
  label: string
  type: SettingFieldType
  hint: string | null
  placeholder: string | null
  options: { value: string; label: string }[] | null
  rows: number | null
  max: number | null
  /** true 表示这个开关真的会影响运行行为，不是占位控件 */
  effective: boolean
  value: string | boolean
}

export interface SettingGroup {
  key: string
  label: string
  subtitle: string
  savedAt: string | null
  /** 只读分区（集成与密钥）：整体不可编辑 */
  readOnly?: boolean
  notice?: string
  fields: SettingField[]
}

export interface SettingsResponse {
  groups: SettingGroup[]
}

export interface SettingsSaveResponse {
  changed: { key: string; label: string; from: string; to: string }[]
  groups: SettingGroup[]
}

/* ------------------------------------------------------------- 站点内容区块 */
/**
 * 区块的字段**约束**由服务端下发（源头是 `shared/sections.mjs`）。
 *
 * 界面不自己再写一份长度上限：写两份必然出现「界面上还能敲、保存却被拒」。
 * 布局仍然各屏自己写 —— 画布逐屏画出来的东西抽象不成一套通用表单引擎。
 */
export interface SectionFieldRule {
  type?: 'text' | 'textarea' | 'url' | 'link' | 'bool'
  max?: number
  required?: boolean
}

export interface SectionRecordFields {
  [key: string]: SectionFieldRule & { label?: string }
}

export interface SectionListRule {
  type: 'chips' | 'records' | 'ids'
  maxItems: number
  itemMax?: number
  /** 平铺条目的输入控件。成句的条目（核心竞争力、经历要点）用 textarea，单行框会截断整句 */
  itemType?: 'text' | 'textarea'
  label?: string
  /** 条目量词，用于「添加一段经历」这类按钮文案 */
  itemLabel?: string
  itemFields?: SectionRecordFields
  /**
   * 条目内部的**嵌套列表**（工作经历条目下既有一串要点，又挂着若干项目，
   * 那些项目自己也带要点）。结构与外层同构，所以渲染也是递归的。
   */
  itemLists?: Record<string, SectionListRule>
  /** 仅 `ids`：允许的取值 */
  values?: string[]
  /** 仅 `ids`：必须不重不漏地列出全部取值（简历模块顺序） */
  exhaustive?: boolean
}

/** 跨字段的联合上限（主标题 = 中文名 + 分隔符 + 拉丁名） */
export interface SectionCounter {
  keys: string[]
  separator?: string
  max: number
  label: string
}

/** 区块文档。形状由前台渲染决定，后台只是它的编辑视图。 */
export type SectionData = Record<string, unknown>

export interface AdminSection {
  key: string
  label: string
  title: string
  desc: string
  subject: string
  /** 只服务于侧栏面板、不进模块页签的区块（简历的「模块结构」） */
  panelOnly: boolean
  fields: Record<string, SectionFieldRule>
  lists: Record<string, SectionListRule>
  counters: Record<string, SectionCounter>
  labels: Record<string, string>
  data: SectionData
  updatedAt: string | null
}

export interface SectionsResponse {
  module: string
  items: AdminSection[]
}

export interface SectionSaveResponse {
  key: string
  changed: boolean
  /** 真的变了的字段（整份提交，服务端逐字段比对后回带） */
  fields: string[]
  data: SectionData
  updatedAt: string | null
}

/* ------------------------------------------------------------------- 媒体库 */

export type MediaKind = 'image' | 'icon' | 'doc'
export type MediaSortKey = 'recent' | 'oldest' | 'name' | 'size'

/** 一处引用。`href` 指回能改它的那一屏，前端不做「资源 → 路由」的二次映射。 */
export interface MediaReference {
  type: 'post' | 'settings' | 'section'
  id: number | string
  label: string
  note: string | null
  href: string
}

export interface MediaItem {
  id: number
  filename: string
  url: string
  mime: string
  kind: MediaKind
  bytes: number
  bytesLabel: string
  /** 只有 PNG 能读出尺寸，其余是 null —— 界面显示「—」，不猜 */
  width: number | null
  height: number | null
  alt: string
  createdAt: string
  /** 库里有行、磁盘上没文件 */
  missing: boolean
  references: MediaReference[]
  referenceCount: number
}

export interface MediaFacets {
  counts: { all: number; image: number; icon: number; doc: number }
  bytes: number
  bytesLabel: string
  missing: number
  totalLabel: string
}

export interface MediaListResponse extends MediaFacets {
  items: MediaItem[]
  kind: string
  sort: MediaSortKey
  kinds: { key: MediaKind; label: string }[]
  sorts: { value: MediaSortKey; label: string }[]
  /** 上传白名单与各项上限来自服务端：界面上的提示与拒收用的是同一份 */
  policy: { accept: string; hint: string; maxBytes: number; maxAlt: number }
}

export interface MediaSaveResponse extends MediaFacets {
  item: MediaItem
  changed: boolean
}

export interface MediaDeleteResponse extends MediaFacets {
  deleted: true
  id: number
  fileRemoved: boolean
  removedReferences: number
}

/**
 * 上传。
 *
 * 走原始体而不是 `FormData`：服务端那头就是一个 `express.raw`，一个文件不值得
 * 为它引 multipart 依赖。文件名进请求头（浏览器不会把它塞进 body），
 * 类型用 `Content-Type` —— 这两项都是服务端白名单要读的东西。
 */
async function uploadMedia(file: File): Promise<{ item: MediaItem } & MediaFacets> {
  let res: Response
  try {
    res = await fetch('/api/admin/media', {
      method: 'POST',
      headers: {
        'Content-Type': file.type || 'application/octet-stream',
        'X-Upload-Name': encodeURIComponent(file.name),
      },
      body: file,
      credentials: 'same-origin',
    })
  } catch {
    throw new ApiError('无法连接服务端，请确认后台服务已启动', 0)
  }
  return parseResponse<{ item: MediaItem } & MediaFacets>(res)
}

export const adminApi = {
  me: () => request<{ user: AdminUser; twoFactor: TwoFactorStatus; serverTime: string }>('GET', '/admin/me'),

  login: (credentials: LoginCredentials) => request<LoginResult>('POST', '/admin/login', credentials),

  verifyTwoFactor: (ticket: string, code: string) =>
    request<LoginResult>('POST', '/admin/2fa/verify', { ticket, code }),

  loginWithRecoveryCode: (ticket: string, code: string) =>
    request<LoginResult>('POST', '/admin/2fa/recovery', { ticket, code }),

  logout: () => request<{ ok: true }>('POST', '/admin/logout'),

  account: () =>
    request<{ user: AdminUser; createdAt: string | null; updatedAt: string | null }>(
      'GET',
      '/admin/account'
    ),

  updateAccount: (displayName: string) =>
    request<{ user: AdminUser; updatedAt: string }>('PATCH', '/admin/account', { displayName }),

  changePassword: (currentPassword: string, newPassword: string) =>
    request<{ ok: true }>('POST', '/admin/account/password', { currentPassword, newPassword }),

  twoFactorStatus: () => request<TwoFactorStatus>('GET', '/admin/2fa/status'),
  setupTwoFactor: () => request<TwoFactorSetup>('POST', '/admin/2fa/setup'),
  enableTwoFactor: (code: string, deviceLabel?: string) =>
    request<{ ok: true; recoveryCodes: string[] }>('POST', '/admin/2fa/enable', { code, deviceLabel }),
  disableTwoFactor: (password: string) =>
    request<{ ok: true }>('POST', '/admin/2fa/disable', { password }),
  regenerateRecoveryCodes: (password: string) =>
    request<{ ok: true; recoveryCodes: string[] }>('POST', '/admin/2fa/recovery-codes', { password }),

  sessions: () => request<{ sessions: SessionRow[] }>('GET', '/admin/sessions'),
  revokeSession: (id: number) => request<{ ok: true }>('DELETE', `/admin/sessions/${id}`),

  visitors: (query: VisitorQuery = {}) => {
    const q = new URLSearchParams()
    if (query.range !== undefined) q.set('range', String(query.range))
    if (query.keyword) q.set('keyword', query.keyword)
    if (query.page) q.set('page', String(query.page))
    if (query.perPage) q.set('perPage', String(query.perPage))
    const qs = q.toString()
    return request<VisitorResponse>('GET', `/admin/visitors${qs ? `?${qs}` : ''}`)
  },

  auditLogs: (query: AuditLogQuery = {}) => {
    const q = new URLSearchParams()
    if (query.result && query.result !== 'all') q.set('result', query.result)
    if (query.range !== undefined) q.set('range', String(query.range))
    if (query.actor) q.set('actor', query.actor)
    if (query.page) q.set('page', String(query.page))
    if (query.perPage) q.set('perPage', String(query.perPage))
    const qs = q.toString()
    return request<AuditLogResponse>('GET', `/admin/audit-logs${qs ? `?${qs}` : ''}`)
  },

  /** 清理超出保留期的日志。days 省略时用服务端默认（90 天）。 */
  pruneAuditLogs: (days?: number) =>
    request<{ removed: number; days: number; counts: AuditLogResponse['counts']; expired: number; total: number }>(
      'POST',
      `/admin/audit-logs/prune${days ? `?days=${days}` : ''}`
    ),

  settings: () => request<SettingsResponse>('GET', '/admin/settings'),

  saveSettings: (patch: Record<string, string | boolean>) =>
    request<SettingsSaveResponse>('PATCH', '/admin/settings', patch),

  posts: (query: PostListQuery = {}) => {
    const q = new URLSearchParams()
    if (query.status) q.set('status', query.status)
    if (query.category && query.category !== 'all') q.set('category', query.category)
    if (query.sort) q.set('sort', query.sort)
    if (query.page) q.set('page', String(query.page))
    if (query.perPage) q.set('perPage', String(query.perPage))
    const qs = q.toString()
    return request<PostListResponse>('GET', `/admin/posts${qs ? `?${qs}` : ''}`)
  },

  categories: () => request<{ items: CategoryItem[] }>('GET', '/admin/categories'),

  /* ------------------------------------------------ 分类与标签（一屏的读写） */

  /** 一次取完分类、标签、近重复分组与各项计数：它们互相决定对方的可用状态 */
  taxonomy: () => request<TaxonomyResponse>('GET', '/admin/taxonomy'),

  createCategory: (name: string) => request<CategorySaveResponse>('POST', '/admin/categories', { name }),

  /** 重命名。服务端会连 `posts.category` 一起改，返回 `movedPosts` 说明连带改了几篇 */
  renameCategory: (id: number, name: string) =>
    request<CategorySaveResponse>('PATCH', `/admin/categories/${id}`, { name }),

  /** 与项目排序同一口径：提交整份 id 顺序，下标即新顺序 */
  reorderCategories: (ids: number[]) =>
    request<{ reordered: number; items: CategoryItem[] }>('POST', '/admin/categories/reorder', { ids }),

  /**
   * 删除分类。挂着文章时服务端会 409 —— 传 `force` 才解绑后删除。
   * 前端靠列表里的 `postCount` 决定要不要先摆代价，409 是最后一道。
   */
  deleteCategory: (id: number, force = false) =>
    request<CategoryDeleteResponse>('DELETE', `/admin/categories/${id}${force ? '?force=1' : ''}`),

  createTag: (name: string) => request<TagSaveResponse>('POST', '/admin/tags', { name }),

  /** 改名不动关联：`post_tags` 是按 id 记的 */
  renameTag: (id: number, name: string) => request<TagSaveResponse>('PATCH', `/admin/tags/${id}`, { name }),

  /** 删除标签只解除关联，文章不受影响 */
  deleteTag: (id: number) => request<TagDeleteResponse>('DELETE', `/admin/tags/${id}`),

  pruneUnusedTags: () => request<TagPruneResponse>('POST', '/admin/tags/prune-unused'),

  /** 合并近重复标签。组与保留者由服务端现算，这里不带任何参数 */
  mergeTags: () => request<TagMergeResponse>('POST', '/admin/tags/merge'),

  post: (id: number) => request<PostDetailResponse>('GET', `/admin/posts/${id}`),

  createPost: (payload: PostSavePayload) =>
    request<{ post: PostDetail; counts: PostCounts }>('POST', '/admin/posts', payload),

  savePost: (id: number, payload: PostSavePayload) =>
    request<PostSaveResponse>('PATCH', `/admin/posts/${id}`, payload),

  updatePostStatus: (id: number, status: PostStatus) =>
    request<{ post: PostListItem; changed: boolean; counts?: PostCounts }>('PATCH', `/admin/posts/${id}`, {
      status,
    }),

  deletePost: (id: number) =>
    request<{ deleted: true; id: number; counts?: PostCounts }>('DELETE', `/admin/posts/${id}`),

  projects: (query: { language?: string; sort?: ProjectSortKey } = {}) => {
    const q = new URLSearchParams()
    if (query.language && query.language !== 'all') q.set('language', query.language)
    if (query.sort) q.set('sort', query.sort)
    const qs = q.toString()
    return request<ProjectListResponse>('GET', `/admin/projects${qs ? `?${qs}` : ''}`)
  },

  createProject: (payload: ProjectSavePayload) =>
    request<ProjectSaveResponse>('POST', '/admin/projects', payload),

  saveProject: (id: number, payload: ProjectSavePayload) =>
    request<ProjectSaveResponse>('PATCH', `/admin/projects/${id}`, payload),

  deleteProject: (id: number) =>
    request<{ deleted: true; id: number } & ProjectFacets>('DELETE', `/admin/projects/${id}`),

  /**
   * 拖拽排序：提交**整份** id 顺序，下标即新顺序。
   *
   * 不做「把 A 移到 B 前面」的增量指令 —— 那要求服务端复现前端的移动算法，
   * 两边算错一次顺序就静默错位。整份下发没有这种可能。
   */
  reorderProjects: (ids: number[]) =>
    request<{ reordered: number; items: ProjectItem[] }>('POST', '/admin/projects/reorder', { ids }),

  dashboard: (range: number) => request<DashboardData>('GET', `/admin/dashboard?range=${range}`),

  /** 某一屏的内容区块（首页内容 → module=home）。不带 module 时返回全部。 */
  sections: (module?: string) =>
    request<SectionsResponse>('GET', `/admin/sections${module ? `?module=${encodeURIComponent(module)}` : ''}`),

  /**
   * 保存一个区块。载荷是**整份区块文档**：嵌套数组上「空数组 = 清空还是没改」
   * 没有唯一答案，所以服务端不做深合并。
   */
  saveSection: (key: string, payload: SectionData) =>
    request<SectionSaveResponse>('PATCH', `/admin/sections/${encodeURIComponent(key)}`, payload),

  media: (query: { kind?: string; sort?: MediaSortKey } = {}) => {
    const q = new URLSearchParams()
    if (query.kind && query.kind !== 'all') q.set('kind', query.kind)
    if (query.sort) q.set('sort', query.sort)
    const qs = q.toString()
    return request<MediaListResponse>('GET', `/admin/media${qs ? `?${qs}` : ''}`)
  },

  uploadMedia,

  /** 改信息目前只有替代文本一项 —— 文件名与地址是磁盘路径与所有引用的锚点。 */
  saveMedia: (id: number, payload: { alt: string }) =>
    request<MediaSaveResponse>('PATCH', `/admin/media/${id}`, payload),

  /**
   * 删除。被引用时服务端会 409 拦下；`force` 是管理员在看清引用清单之后的第二次确认。
   */
  deleteMedia: (id: number, force = false) =>
    request<MediaDeleteResponse>('DELETE', `/admin/media/${id}${force ? '?force=1' : ''}`),
}
