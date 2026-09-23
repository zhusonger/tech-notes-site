/**
 * 后台文案与导航的单一数据源。
 *
 * 与展示站的 `site.ts` 同一条约定：组件只消费、不硬编码。
 * 后台导航结构：内容 5 / 站点配置 2 / 系统 2。
 */

/**
 * 后台外壳的品牌**默认值**。
 *
 * 只放与站点无关的中性值：站点名称属于可编辑的站点设置，由 `useSiteBrand()`
 * 从 `/api/content/site` 读（与前台同一份来源）。写死在这里的后果是
 * 「前台改了站点名、后台侧边栏还挂着旧的」—— 这类不一致不报错，只能靠肉眼发现。
 *
 * `sub` 留在这里：它是「后台」这件事本身的说法，不是站点内容，没有可编辑的理由。
 */
export const adminBrand = {
  name: 'Tech Notes',
  sub: '内容管理后台',
  monogram: 'T',
} as const

export interface AdminNavItem {
  key: string
  label: string
  to: string
  /** 面包屑所属分组，用于顶栏第一段 */
  group: string
}

export interface AdminNavGroup {
  label: string
  items: AdminNavItem[]
}

export const adminNav: AdminNavGroup[] = [
  {
    label: '内容',
    items: [
      { key: 'dashboard', label: '仪表盘', to: '/admin', group: '内容' },
      { key: 'visitors', label: '访客记录', to: '/admin/visitors', group: '内容' },
      { key: 'posts', label: '文章', to: '/admin/posts', group: '内容' },
      { key: 'projects', label: '项目', to: '/admin/projects', group: '内容' },
      { key: 'resume', label: '简历', to: '/admin/resume', group: '内容' },
      { key: 'media', label: '媒体库', to: '/admin/media', group: '内容' },
    ],
  },
  {
    label: '站点配置',
    items: [
      { key: 'home', label: '首页内容', to: '/admin/home', group: '站点配置' },
      { key: 'taxonomy', label: '分类与标签', to: '/admin/taxonomy', group: '站点配置' },
    ],
  },
  {
    label: '系统',
    items: [
      { key: 'settings', label: '站点设置', to: '/admin/settings', group: '系统' },
      { key: 'audit', label: '操作日志', to: '/admin/audit', group: '系统' },
    ],
  },
]

/** 不在侧边栏里的页面（账号相关），顶栏面包屑同样需要它。 */
export const adminExtraPages: Record<string, { label: string; group: string }> = {
  account: { label: '账号设置', group: '系统' },
  security: { label: '账号安全', group: '系统' },
}

export const adminLoginCopy = {
  brandTitle: '内容管理后台',
  brandDesc: '集中维护文章、项目、简历与站点配置，所有变更实时同步到前台。',
  title: '登录',
  subtitle: '使用管理员邮箱与密码登录后台',
  emailLabel: '邮箱地址',
  passwordLabel: '密码',
  /**
   * 画布上此处是一枚橙色「忘记密码？」链接。但后台没有任何自助找回通道
   * （无邮件服务、无重置令牌），做成可点的橙色链接就是一条死路 —— 这里
   * 改成把出路直接写明的静态提示，位置与画布一致，只是不再伪装成链接。
   */
  forgot: '忘记密码？请联系站点所有者',
  remember: '在此设备保持登录 30 天',
  submit: '登录',
  hint: '登录后需完成两步验证（2FA）',
  foot: '本后台仅限授权管理员访问',
  /** 未绑定 2FA 时的提示 —— 画布上写的是「登录后需完成」，这里按真实状态改写 */
  hintDisabled: '当前账号尚未绑定两步验证，建议登录后在「账号安全」中开启',
} as const

export const adminTwoFactorCopy = {
  title: '两步验证',
  subtitle: '请输入认证器应用中的 6 位动态验证码',
  codeLabel: '验证码有效期',
  remaining: '剩余 {s} 秒',
  submit: '验证并登录',
  useRecovery: '使用恢复码登录',
  back: '返回登录',
  foot: '认证器丢失且无恢复码时，需联系站点所有者重置两步验证',
  recoveryTitle: '使用恢复码登录',
  recoverySubtitle: '输入一个未使用过的恢复码，登录后请立即重新生成',
  recoveryLabel: '恢复码',
  recoveryPlaceholder: 'XXXX-XXXX',
  recoverySubmit: '用恢复码登录',
  recoveryFoot: '每个恢复码仅可使用一次',
} as const

export const adminAccountCopy = {
  pageTitle: '账号设置',
  pageSubtitle: '管理员资料与登录凭据管理',
  logout: '退出登录',
  sections: [
    { key: 'profile', label: '个人资料' },
    { key: 'password', label: '修改密码' },
    { key: 'devices', label: '登录设备' },
    { key: 'security', label: '会话与安全' },
  ],
  profile: {
    title: '个人资料',
    subtitle: '这些信息会显示在文章署名与操作日志中',
    avatarLabel: '头像',
    avatarHint: '建议上传 512 × 512 的正方形 PNG；当前版本使用首字母标识，暂不支持上传',
    changeAvatar: '更换头像',
    remove: '重置',
    displayName: '显示名称',
    email: '登录邮箱',
    emailHint: '登录邮箱即管理员身份，暂不支持自行修改',
    role: '角色与权限',
    roleHint: '由系统分配，不可自行修改',
    roleValue: '超级管理员 · Super Admin',
    roleValuePlain: '管理员 · Admin',
    savedAt: '上次保存 · {time}',
    cancel: '取消',
    save: '保存更改',
    saved: '已保存',
  },
  password: {
    title: '修改密码',
    subtitle: '修改后其他设备的会话会立即失效',
    current: '当前密码',
    next: '新密码',
    confirm: '确认新密码',
    rule: '任意非空密码即可，最长 128 位',
    submit: '更新密码',
    mismatch: '两次输入的新密码不一致',
    weak: '新密码不符合强度要求',
    done: '密码已更新，其他设备已退出登录',
  },
  devices: {
    title: '登录设备',
    subtitle: '当前账号的有效会话，可逐条吊销',
    empty: '暂无其他登录设备',
    current: '当前设备',
    created: '登录于 {time}',
    lastSeen: '最近活跃 {time}',
    expires: '有效期至 {time}',
    revoke: '吊销',
    revoked: '已吊销该设备',
    unknownAgent: '未知设备',
  },
  security: {
    title: '会话与安全',
    subtitle: '两步验证、恢复码与危险操作',
    go: '前往账号安全',
    desc: '管理两步验证（TOTP）、恢复码，以及关闭两步验证等敏感操作。',
  },
} as const

export const adminSecurityCopy = {
  pageTitle: '账号安全',
  pageSubtitle: '登录密码、两步验证与登录设备',
  enabledBadge: '两步验证已启用',
  disabledBadge: '两步验证未启用',
  sections: [
    { key: 'password', label: '登录密码' },
    { key: 'twofa', label: '两步验证' },
    { key: 'recovery', label: '恢复码' },
    { key: 'devices', label: '登录设备' },
  ],
  twofa: {
    title: '两步验证',
    subtitle: '使用认证器应用（TOTP）为登录增加第二道验证',
    badgeEnabled: '已启用',
    badgeDisabled: '未启用',
    enabledStrip: '两步验证已启用 · {time} 绑定认证器',
    disabledStrip: '两步验证未启用，登录仅需邮箱与密码',
    appLabel: '认证器应用',
    appValue: '认证器应用（TOTP）',
    boundAt: '绑定时间',
    secretLabel: '手动输入密钥（二维码无法扫描时使用）',
    secretHint: '密钥仅在生成时展示，关闭后会重新生成',
    qrHint: '用认证器应用扫描二维码',
    startSetup: '生成密钥并扫码',
    regenerate: '重新生成密钥',
    codeLabel: '输入认证器上的 6 位验证码',
    confirm: '验证并启用',
    cancel: '取消绑定',
    disableTitle: '关闭两步验证',
    disableHint: '关闭后登录仅需邮箱与密码，账号安全性将显著下降',
    disable: '关闭两步验证',
    disablePrompt: '请输入登录密码以确认关闭两步验证',
    passwordLabel: '登录密码',
    confirmDisable: '确认关闭',
    footEnabled: '两步验证的状态变更立即生效',
    footDisabled: '启用后每次登录都需要输入认证器验证码',
    done: '完成',
    viewDevices: '查看登录设备',
  },
  recovery: {
    title: '恢复码',
    label: '恢复码',
    hint: '共 8 个 · 每个仅可使用一次',
    remaining: '剩余 {n} 个可用',
    none: '尚未生成恢复码，启用两步验证时会自动生成',
    regenerate: '重新生成恢复码',
    regeneratePrompt: '重新生成会让旧恢复码立即作废，请输入登录密码确认',
    freshTitle: '新的恢复码（仅本次显示）',
    freshHint: '请立即抄写保存。离开本页后将无法再次查看。',
    copied: '已复制',
    copy: '复制全部',
    close: '我已保存',
  },
} as const

export const adminDashboardCopy = {
  pageTitle: '仪表盘',
  pageSubtitle: '站点运行概览 · 数据更新于 {time}',
  ranges: [
    { key: '7', label: '近 7 天' },
    { key: '30', label: '近 30 天' },
    { key: '365', label: '全年' },
  ],
  newPost: '新建文章',
  searchPlaceholder: '搜索文章、项目…',
  kpi: {
    published: '已发布文章',
    views: '总阅读量',
    drafts: '草稿箱',
    visitors: '独立访客',
    draftUnit: '篇',
  },
  trend: { title: '阅读趋势', meta: '近 {n} 天', empty: '这段时间还没有访问记录' },
  distribution: { title: '内容分布', meta: '共 {n} 篇', empty: '还没有已发布的文章' },
  recent: { title: '最近编辑', link: '查看全部', empty: '还没有内容' },
  todos: { title: '待办与提醒', empty: '暂无待办 · 站点状态良好' },
  weekly: { label: '本周完成', value: '{done} / {target}' },
  status: { published: '已发布', draft: '草稿' },
} as const

export const adminPostsCopy = {
  title: '文章',
  /** 副标题用真实计数拼，不在文案里写死数字 */
  summary: '{published} 篇已发布 · {draft} 篇草稿 · {categories} 个分类',
  tabs: { all: '全部', published: '已发布', draft: '草稿', trash: '回收站' },
  filter: { category: '全部分类', sort: '最近更新' },
  sortOptions: { updated: '最近更新', created: '最近创建', views: '阅读量' },
  columns: { title: '标题', status: '状态', views: '阅读量', updated: '更新时间' },
  rowMenu: { edit: '编辑', publish: '发布', unpublish: '转为草稿', trash: '移入回收站', restore: '移出回收站', remove: '彻底删除' },
  empty: {
    all: '还没有文章',
    published: '还没有已发布的文章',
    draft: '草稿箱是空的',
    trash: '回收站是空的',
  },
  footer: {
    summary: '共 {total} 篇 · 已发布 {published} · 草稿 {draft}',
    page: '{page} / {total}',
    filtered: '当前筛选：{label} · 共 {total} 篇',
  },
  error: '文章列表加载失败',
  retry: '重试',
  untitled: '（未命名）',
  uncategorized: '未分类',
  confirmDelete: '彻底删除后无法恢复，确定删除《{title}》？',
} as const

/**
 * 文章编辑器。
 *
 * 文案里刻意**没有**「自动保存于 X 分钟前」这类句子。画布上那一行是设计稿的示意，
 * 但本后台的保存是显式的（原因见 AdminPostEditor 顶部的注释：自动保存会把
 * 操作日志刷成一片「保存文章 · 正文」）。写一句不成立的自动保存说明，
 * 比少一个状态指示更糟 —— 作者会以为关掉页面也不会丢。
 */
export const adminPostEditorCopy = {
  edit: '编辑文章',
  create: '新建文章',
  back: '返回文章列表',
  preview: '预览',
  previewBlocked: '草稿与回收站里的文章不会出现在前台，发布之后才能预览',
  save: '保存',
  saving: '保存中…',
  savedAt: '已保存 · {time}',
  unsaved: '有未保存的修改',
  idle: '尚未修改',
  neverSaved: '尚未保存',
  shortcut: '⌘S / Ctrl+S 保存',
  /** 离开前的拦截提示（beforeunload） */
  leave: '有未保存的修改，离开将丢失这些改动。',
  publish: '发布',
  unpublish: '转为草稿',
  restore: '移出回收站',
  trash: '移入回收站',
  remove: '彻底删除',
  copyLink: '复制前台链接',
  copied: '前台链接已复制',
  more: '更多操作',
  author: '作者',
  publishedAt: '发布时间',
  notPublished: '尚未发布',
  sectionPublish: '发布设置',
  sectionCategory: '分类',
  sectionTags: '标签',
  sectionCover: '封面图',
  sectionSeo: 'SEO 描述',
  labelTitle: '标题',
  labelSlug: '永久链接',
  labelExcerpt: '摘要 · 列表页与 SEO 描述共用',
  labelBody: '正文',
  labelCategory: '分类',
  labelStatus: '状态',
  markdownOn: 'Markdown 已启用',
  tabEdit: '编辑',
  tabPreview: '预览',
  slugPrefix: '/blog/',
  slugRule: '只能用小写字母、数字与连字符',
  excerptMax: 300,
  seoMax: 160,
  tagAdd: '添加标签',
  tagPlaceholder: '输入标签后回车',
  tagMax: '标签最多 12 个',
  tagRemove: '移除标签',
  noCategory: '未分类',
  coverHint: '建议 1200 × 630。上传能力随「媒体库」一起接入，当前只能填图片地址。',
  coverPlaceholder: 'https://…',
  coverApply: '应用',
  coverRemove: '移除',
  coverEmpty: '还没有封面图',
  bodyEmpty: '正文还是空的',
  bodyEmptyHint: '用 Markdown 写，左侧工具条可以插入常用的几段语法。',
  toolBold: '加粗 ⌘B',
  toolItalic: '斜体 ⌘I',
  toolHeading: '小标题',
  toolLink: '链接',
  toolQuote: '引用',
  toolCode: '代码块',
  toolList: '列表',
  loading: '正在载入文章…',
  notFound: '这篇文章不存在，可能已被彻底删除',
  loadError: '文章加载失败',
  saveError: '保存失败',
  retry: '重试',
  conflict: '这篇文章在你打开期间被改过，刷新后再改，避免覆盖掉别处的修改',
  created: '《{title}》已创建，当前是草稿',
  saved: '已保存：{fields}',
  trashed: '《{title}》已移入回收站',
  confirmTrash: '移入回收站后前台立即不可见，可以再移出来。确定移入？',
  confirmRemove: '彻底删除后无法恢复，确定删除《{title}》？',
  statusLabels: { published: '已发布', draft: '草稿', trash: '回收站' },
} as const

export const adminVisitorsCopy = {
  title: '访客记录',
  subtitle: '展示站的来源明细：每个独立访客的 IP、归属地区与访问设备',
  ranges: [
    { key: '1', label: '今天' },
    { key: '7', label: '近 7 天' },
    { key: '30', label: '近 30 天' },
    { key: '0', label: '全部' },
  ],
  searchPlaceholder: '按 IP 搜索',
  columns: {
    ip: 'IP 地址',
    region: '归属地区',
    device: '访问设备',
    views: '浏览',
    first: '首次访问',
    last: '最近访问',
  },
  privateLabel: '内网',
  botLabel: '爬虫',
  unknown: '未知',
  empty: '这个时间范围内还没有访客记录',
  emptyFiltered: '没有匹配的访客',
  error: '访客记录加载失败',
  retry: '重试',
  footer: {
    policy: '明细保留 {days} 天',
    summary: '共 {total} 位独立访客 · {views} 次浏览',
  },
}

export const adminAuditCopy = {
  title: '操作日志',
  subtitle: '记录后台的关键操作与登录事件，便于问题追溯与安全审计',
  results: [
    { key: 'all', label: '全部' },
    { key: 'success', label: '成功' },
    { key: 'failed', label: '失败' },
  ],
  ranges: [
    { key: '7', label: '近 7 天' },
    { key: '30', label: '近 30 天' },
    { key: '90', label: '近 90 天' },
    { key: '0', label: '全部时间' },
  ],
  allActors: '全部成员',
  columns: { time: '时间', actor: '操作者', ip: '访问 IP', text: '操作内容', result: '结果' },
  resultLabel: { success: '成功', failed: '失败' },
  systemActor: '系统',
  unknownAction: '（未登记的动作码）',
  loadMore: '加载更多',
  loading: '正在加载…',
  empty: '这个时间范围内没有操作记录',
  emptyFiltered: '没有符合当前筛选条件的记录',
  footer: {
    policy: '日志保留 {days} 天',
    shown: '已显示最近 {shown} 条，共 {total} 条记录',
    expired: '{n} 条超出保留期',
    refreshed: '更新于 {time}',
  },
  error: '操作日志加载失败',
  retry: '重试',
  retention: {
    button: '保留策略',
    title: '日志保留策略',
    body: '操作日志默认保留 {days} 天，超出部分会在服务启动时及之后每天自动清理一次；手动清理会额外记一条「清理操作日志」的日志。',
    current: '当前共 {total} 条记录，其中 {expired} 条已超出 {days} 天的保留期。',
    nothingToDo: '当前没有超出保留期的记录，无需清理。',
    action: '清理 {days} 天前的日志',
    confirmTitle: '确认清理操作日志',
    confirmBody: '将永久删除 {cutoff} 之前的所有操作日志，共 {n} 条。删除后无法恢复，确认继续？',
    done: '已清理 {n} 条日志',
    close: '关闭',
  },
} as const

export const adminSettingsCopy = {
  title: '站点设置',
  subtitle: '站点基础信息、SEO 元数据、域名与作者资料',
  viewSite: '查看站点',
  previewSite: '预览前台',
  readonly: '只读',
  savedAt: '上次保存 · {time}',
  neverSaved: '尚未修改过',
  cancel: '取消',
  save: '保存更改',
  saved: '已保存 {n} 项变更',
  noChange: '没有需要保存的变更',
  discard: '放弃未保存的修改？',
  revert: '已放弃修改',
  error: '站点设置加载失败',
  saveError: '保存失败',
  retry: '重试',
  unsaved: '有未保存的修改',
  /** 底部「取消」只清当前分区，这个才清掉所有分区累积的草稿 */
  discardAll: '放弃全部修改',
  urlPreview: '预览',
} as const

/**
 * 项目卡片墙。
 *
 * 副标题与画布一致地由**真实计数**拼（画布上的「20 个项目 · 6 个精选 · 累计 6.8k stars」
 * 是示意数字），所以这里只留句式。
 */
/* ------------------------------------------------------------ 区块表单通用 */
/**
 * 区块表单零件的共用文案（增删条目、上下移动、条数上限）。
 *
 * 首页内容与简历两屏用的是同一套列表编辑器（`src/admin/sectionForm.tsx`），
 * 所以这几句也只能有一份 —— 两屏各写一遍，就会出现「一屏叫『上移一位』、
 * 另一屏叫『向上移动』」这种只有截图对比才发现的发散。
 */
export const adminFormCopy = {
  add: '添加{unit}',
  remove: '删除这条',
  moveUp: '上移一位',
  moveDown: '下移一位',
  empty: '还没有条目',
  chipPlaceholder: '输入后回车添加',
  chipAdd: '添加',
  chipRemove: '删除这一条',
  limit: '最多 {n} 条',
}

/* ------------------------------------------------------------------ 首页内容 */
/**
 * 首页内容屏的文案。
 *
 * 字段**约束**（字数上限、必填）不在这里 —— 那些由服务端随区块下发（源头
 * `shared/sections.mjs`），界面照着画计数即可，不再抄一份。
 * 这里只放画布上写明的中文标签：画布把这些字段逐格画了出来（`13:812` 起），
 * 标签是设计的一部分；画布没画到的「关于我 / 技术栈」两块则直接用服务端下发的
 * 中文名，省掉一份没人看第二眼的重复清单。
 */
export const adminHomeCopy = {
  title: '首页内容',
  subtitle: '编辑前台首页可见的文案与配图 · 保存后立即生效',
  previewSite: '预览前台',

  field: {
    eyebrow: '眉标 Eyebrow',
    headline: '主标题 H1',
    headlineHint: '前台渲染成「中文名 · 拉丁名」，中间那个分隔点由前台生成并着色',
    name: '中文名',
    latin: '拉丁名',
    subline: '副标题 Subline',
    paragraph: '介绍段落 Paragraph',
    paragraphHint: '建议 80 字以内',
    trust: '数据背书 Trust Line',
    ctas: '行动按钮 CTAs',
    ctasHint: '前台按主次依次展示',
    primaryLabel: '主按钮 · 文案',
    primaryTo: '主按钮 · 跳转链接',
    secondaryLabel: '次按钮 · 文案',
    secondaryTo: '次按钮 · 跳转链接',
    image: '首屏配图地址',
    imageHint: '相对路径（如 /images/hero-workspace.png）或完整 URL',
    switches: '显示开关',
  },

  /** 列表编辑器的通用文案 */
  list: { ...adminFormCopy },

  /**
   * 页脚页签。
   *
   * 画布在这一屏留了「页脚」页签（`13:805`），但页脚文案在库里属于
   * `site_settings`，并且已经在「站点设置 → 基础信息」里可编辑。
   * 再做一个写入口就有两份真相：两边都改得动，谁覆盖谁取决于最后点保存的是谁。
   * 所以这一页只读 + 指路，页脚的**预览**仍然留在这里（它确实是首页的一部分）。
   */
  footer: {
    title: '页脚 · Footer',
    desc: '页脚出现在全站每一页的底部，归「站点设置 → 基础信息」统一维护，因此这里只做预览',
    readonly: '只读',
    quote: '页脚寄语',
    note: '页脚说明',
    copyright: '版权信息',
    links: '页脚链接',
    linksValue: '由站点导航自动派生',
    goSettings: '去站点设置修改',
    loadError: '页脚文案读取失败',
  },

  preview: {
    title: '实时预览',
    viewport: '1440 × 900',
    hint: '左侧修改后，此处预览实时同步',
    scope: { hero: '首页 · 首屏 Hero', about: '首页 · 关于我', stack: '首页 · 技术栈', footer: '首页 · 页脚' },
    belowFold: '以下为首页首屏之下的内容',
    imageLabel: '首屏配图',
    imageHidden: '已隐藏配图',
    trustHidden: '已隐藏数据背书',
    note: '按前台的排版层级缩小渲染，用于核对文案与主次',
  },

  save: '保存修改',
  saving: '保存中…',
  cancel: '取消修改',
  savedAt: '上次保存 · {time}',
  neverSaved: '尚未保存过',
  synced: '已同步',
  dirty: '有未保存的修改',
  unsaved: '当前有 {n} 项修改尚未保存',
  discardAll: '放弃全部修改',
  discardAllTitle: '放弃未保存的修改',
  discardAllMessage: '当前有 {n} 项修改尚未保存，放弃后将恢复为已保存的值。',
  continueEdit: '继续编辑',
  saved: '「{label}」已保存 · 改动 {n} 处',
  noChange: '内容没有变化，未写入',
  saveError: '保存失败',
  loadError: '首页内容加载失败',
  retry: '重试',
  reverted: '已放弃本页修改',
} as const

/* -------------------------------------------------------------------- 简历 */
/**
 * 简历屏的文案。
 *
 * 与首页内容屏的差别值得先说一句：**画布只画了「概要」一个页签的字段**，
 * 而画出来的那些（姓名 / 头衔 / 一句话简介 / 当前状态 / 所在城市 / 头像 + 两个开关）
 * 要么是站点级事实、要么在前台根本没有对应元素。取舍写在 `AdminResume` 的文件头，
 * 这里只放确实用到的文案。
 */
export const adminResumeCopy = {
  title: '简历',
  subtitle: '编辑简历页的概要、经历与技能，保存后同步到前台 /resume',
  previewSite: '预览前台',

  field: {
    eyebrow: '眉标 Eyebrow',
    pageTitle: '页面标题 H1',
    position: '一行定位 Description',
    summary: '个人概述 Summary',
    summaryHint: '出现在正文「个人概述」一节，建议 300 字以内',
  },

  /** 概要页签里那组只读的站点级事实 */
  readonly: {
    title: '抬头信息',
    desc: '简历页抬头显示的这几项由「站点设置 → 作者资料」统一维护 —— 首页名片、文章作者卡与简历页抬头共用同一份，所以这里只读',
    badge: '只读',
    avatar: '头像 Avatar',
    goSettings: '去站点设置修改',
  },

  /** 技能与教育页签里的只读教育块 */
  education: {
    title: '教育背景与证书',
    desc: '首页「关于我」与简历页共用这一份，因此在「站点设置 → 作者资料」里维护',
    badge: '只读',
    goSettings: '去站点设置修改',
  },

  /** 联系方式页签里那组只读的取值 */
  contact: {
    title: '这几项显示什么，由上面的开关决定',
    desc: '邮箱、城市与 GitHub 的取值来自「站点设置 → 作者资料」，这里只决定显示与否',
    badge: '只读',
    goSettings: '去站点设置修改',
  },

  panel: {
    title: '模块结构',
    desc: '拖动调整前台展示顺序',
    count: '{n} 个模块',
    countHidden: '已隐藏 {h} 个',
    dragHandle: '拖拽调整顺序',
    hide: '从前台隐藏',
    show: '恢复到前台',
    hiddenBadge: '已隐藏',
    progressTitle: '填写完成度',
    progressHint: '按有内容的小节数估算',
    pending: '待补充：{label}',
    allDone: '每一节都有内容',
    allHidden: '已全部隐藏，前台简历页会只剩抬头',
    tip: '模块顺序决定前台简历页的展示顺序；设置为隐藏的模块只在后台保留，不会出现在前台页面。',
  },

  moduleBadge: {
    filled: '已填写',
    empty: '待填写',
    items: '{n} 条',
    fromSettings: '来自站点设置',
  },

  save: '保存更改',
  saving: '保存中…',
  cancel: '取消',
  savedAt: '上次保存 · {time}',
  neverSaved: '尚未保存过',
  saved: '「{label}」已保存 · 改动 {n} 处',
  noChange: '内容没有变化，未写入',
  saveError: '保存失败',
  loadError: '简历内容加载失败',
  retry: '重试',
  reverted: '已放弃本页修改',
  unsaved: '当前有 {n} 项修改尚未保存',
  discardAll: '放弃全部修改',
  discardAllTitle: '放弃未保存的修改',
  discardAllMessage: '当前有 {n} 项修改尚未保存，放弃后将恢复为已保存的值。',
  continueEdit: '继续编辑',
  orderSaved: '前台顺序已更新',
  orderError: '顺序没能保存，已恢复到改动前的排列',
  hiddenOn: '「{label}」已从前台隐藏',
  hiddenOff: '「{label}」已恢复到前台',
  visibilityError: '显示状态没能保存',
  layoutMissing: '模块结构读取失败，顺序与显示状态暂时改不了',
} as const

export const adminMediaCopy = {
  title: '媒体库',
  subtitle: '统一管理站点使用的图片与图标，支持拖拽上传',
  previewSite: '预览前台',
  refresh: '重新读取',

  /** 顶栏那颗胶囊。数字全是现场算的真实占用，没有配额那一套。 */
  usage: {
    label: '存储占用',
    loading: '统计中…',
    /** 「8 个文件 · 13.0 MB」由服务端拼好下发，前端不重新拼一遍 */
    empty: '还没有文件',
  },

  /** 类型分组胶囊。分组名与计数都来自服务端，前端不写死「全部 / 图片 / 图标 / 文档」。 */
  kindAll: '全部',

  /** 网格 / 列表 切换 */
  view: { grid: '网格', list: '列表' },

  /** 上传瓦片与拖放区 */
  upload: {
    tile: '拖拽或点击上传',
    /** {hint} 由服务端下发的白名单拼出，与拒收口径同源 */
    hint: '{hint}',
    release: '松手即上传',
    uploading: '上传中…',
    done: '「{name}」已上传',
    multiple: '一次只能传一个文件，已取「{name}」',
    /** 前端先做一次体积预检，省掉一次必然失败的往返；真正的判定仍以服务端为准 */
    tooLarge: '「{name}」超过 {limit}，没有上传',
    empty: '这个文件是空的，没有上传',
    /** 类型这一条复用服务端下发的提示原文，前端不自己拼一份可能走岔的清单 */
    wrongType: '「{name}」不在支持的类型里 · {hint}',
    failed: '上传失败',
  },

  /** 文件网格的卡片头与脚 */
  card: {
    title: '全部文件',
    titleOf: '{kind}',
    subtitle: '根目录 · {sort}',
    subtitleFiltered: '根目录 · {kind} · {sort}',
    selected: '{n} 项已选',
    noSelection: '未选中文件',
    empty: '这个分组下还没有文件',
    emptyHint: '拖一张图到左边的上传区试试',
    missing: '文件已不在磁盘上',
    missingHint: '库里有这一行，但对应文件不存在，前台引用它会显示裂图',
  },

  /** 详情面板 */
  detail: {
    title: '文件详情',
    subtitle: '选中文件 · 全部文件',
    subtitleOf: '选中文件 · {kind}',
    empty: '从左侧选一个文件查看详情',
    emptyHint: '可以改替代文本、复制链接，或查看它被哪些地方引用',
    fieldFilename: '文件名',
    fieldAlt: '替代文本 Alt',
    altPlaceholder: '一句话说明这张图是什么',
    altHint: '给读屏与图片加载失败时用',
    altHintReadonly: '文件名与地址不可修改：它们是磁盘路径与所有引用的锚点',
    /** 替代文本上限也来自服务端，这里只负责显示 */
    altCount: '{n} / {max}',
    metaTitle: '文件信息',
    meta: {
      size: '尺寸',
      bytes: '大小',
      format: '格式',
      uploaded: '上传',
    },
    unknown: '—',
    usageTitle: '被引用 {n} 次',
    usageNone: '还没有被引用',
    usageHint: '删掉不会影响任何页面',
    copy: '复制链接',
    copied: '链接已复制',
    copyFailed: '复制失败，请手动复制地址',
    renameHint: '重命名会影响所有引用，所以这里不提供',
    link: '查看引用',
    saving: '保存中…',
    save: '保存替代文本',
    saved: '替代文本已保存',
    noChange: '内容和已保存的一样，没有写入',
    saveError: '保存失败',
  },

  /** 删除：被引用时先摆出代价，再让人决定 */
  remove: {
    action: '删除',
    title: '删除「{name}」',
    message: '删除后无法恢复。',
    referenced: '它还被 {n} 处引用，删掉会让那里变成裂图：',
    confirm: '仍然删除',
    cancel: '取消',
    done: '「{name}」已删除',
    fileKept: '数据库记录已删除，但磁盘上的文件没能删掉，请手动清理',
    failed: '删除失败',
  },

  loadError: '媒体库加载失败',
  retry: '重试',
} as const

/**
 * 分类与标签屏的文案。
 *
 * 两个面板的副标题都由**真实计数**拼（画布上的「共 9 个分类」「共 18 个标签」是示意值），
 * 所以这里只留句式。名字上限同理：不写死在文案里，由服务端随列表下发的 `policy` 填。
 */
export const adminTaxonomyCopy = {
  title: '分类与标签',
  subtitle: '管理文章分类与标签，用于前台筛选、归档与 SEO 关键词',
  previewSite: '预览前台',

  /** 左卡：分类 */
  category: {
    title: '分类',
    subtitle: '拖动排序决定前台归档页的展示顺序',
    /** 画布上那颗胶囊写的是「共 9 个分类」 */
    count: '共 {n} 个分类',
    columns: { name: '名称', posts: '文章数' },
    posts: '{n} 篇',
    empty: '还没有分类',
    emptyHint: '分类决定前台「博客」页的归档筛选，至少留一个',
    footer: '分类用于前台「博客」页的归档筛选',
    create: '新建分类',
    more: '分类操作',
    /** 整行可拖，没有单独的把手 —— 行本身就是拖拽区 */
    dragTitle: '拖动这一行调整顺序',
    rowMenu: {
      rename: '重命名',
      moveUp: '上移一位',
      moveDown: '下移一位',
      remove: '删除分类',
    },
  },

  /** 右面板：标签 */
  tag: {
    title: '标签',
    subtitle: '共 {n} 个标签 · 按使用频次排序',
    inputPlaceholder: '输入标签后回车创建',
    inputCreate: '创建标签',
    /**
     * 近重复时**不拦**，只提一句。拦住并不能真的拦住 ——
     * 文章编辑器里的标签输入框也会顺手建标签，两条路径给不出两套规矩。
     */
    inputNear: '已有相近的标签「{name}」，创建后可以用「合并重复标签」归并',
    empty: '还没有标签',
    emptyHint: '在上面的输入框里敲一个名字，回车即创建',
    /** 画布原文 */
    tip: '标签同时用于前台筛选与 SEO 关键词。删除标签不会删除文章，仅解除关联。',
    selected: '已选中「{name}」',
    selectedClear: '取消选中',
    selectedUsage: '被 {n} 篇文章使用',
    selectedUsageNone: '还没有文章使用它',
    rename: '重命名',
    remove: '删除',
    merge: '合并重复标签',
    mergeNone: '没有发现近重复的标签',
    more: '标签面板操作',
    prune: '清理未使用标签',
    pruneNone: '当前没有未使用的标签',
    pruneSome: '清理 {n} 个未使用标签',
  },

  /** 新建 / 重命名共用的那个单字段弹层 */
  dialog: {
    createCategory: { title: '新建分类', subtitle: '名称会出现在前台「博客」页的筛选条上', label: '分类名称' },
    renameCategory: { title: '重命名分类', subtitle: '会把挂着它的文章一起改过来', label: '分类名称' },
    renameTag: { title: '重命名标签', subtitle: '改名不影响它挂在哪几篇文章上', label: '标签名称' },
    count: '{n} / {max}',
    cancel: '取消',
    save: '保存',
    creating: '创建中…',
    saving: '保存中…',
  },

  /** 拖拽排序：与项目卡片墙同一口径（失败不回滚本地，而是重取） */
  reorderSaved: '前台筛选条的顺序已更新（{n} 个分类）',
  reorderError: '顺序没能保存，已恢复成改动前的排列',

  /** 操作回执。名字一律用《》或「」引起来 —— 同一屏里同名的东西不止一个 */
  created: '已新建分类《{name}》',
  renamed: '已重命名为《{name}》',
  renamedMoved: '已重命名为《{name}》，{n} 篇文章的分类一并更新',
  removed: '已删除分类《{name}》',
  removedUnbound: '已删除分类《{name}》，{n} 篇文章变为未分类',
  tagCreated: '已新建标签「{name}」',
  tagRenamed: '标签已重命名为「{name}」',
  tagRemoved: '已删除标签「{name}」',
  tagRemovedUnbound: '已删除标签「{name}」，解除了 {n} 篇关联',
  tagPruned: '已清理 {n} 个未使用标签',
  tagMergeNone: '没有发现近重复的标签，未做任何改动',
  /** 合并的回执要说清搬了多少篇文章 —— 「合并了 1 组」不告诉人文章有没有跟着走 */
  tagMerged: '已合并 {n} 组重复标签，{n2} 篇文章的标签已归到保留的那一个上',

  /** 删除确认 */
  confirm: {
    categoryTitle: '删除分类',
    categoryMessage: '删除后无法恢复。',
    /** 有文章时先说清代价：那些文章会掉到「未分类」 */
    categoryUsed: '《{name}》下有 {n} 篇文章，删除后它们会变成「未分类」——',
    categoryUsedHint: '前台仍然看得到，只是只有「全部」这一档能筛到它们。',
    categoryConfirmForce: '解绑并删除',
    categoryConfirm: '删除',
    tagTitle: '删除标签',
    tagMessage: '删除后无法恢复，文章本身不受影响。',
    tagUsed: '「{name}」被 {n} 篇文章使用，删除后这些文章仍然在，只是不再带这个标签。',
    tagConfirm: '删除标签',
    mergeTitle: '合并重复标签',
    mergeMessage: '下面这几组会被并成一条，关联的文章不会有任何丢失。',
    mergeConfirm: '合并',
    pruneTitle: '清理未使用标签',
    pruneMessage: '下面这些标签没有挂在任何文章上，删除后无法恢复。',
    pruneConfirm: '全部删除',
    cancel: '取消',
  },

  loadError: '分类与标签加载失败',
  error: '操作失败',
  retry: '重试',
} as const

export const adminProjectsCopy = {
  title: '项目',
  /** 顶栏那颗主操作按钮上的字。画布上项目屏写的是「新建项目」，与文章屏不同。 */
  newProject: '新建项目',
  subtitle: '{all} 个项目 · {featured} 个精选 · 累计 {stars} stars · {reorder}',
  reorderOn: '拖拽卡片调整前台顺序',
  /** 拖不动时必须说清为什么，而不是把把手悄悄变灰 */
  reorderOff: '清除筛选并切回「按排序权重」后可拖拽排序',
  filter: { all: '全部', language: '全部语言', sort: '按排序权重' },
  sortOptions: { order: '按排序权重', stars: '按 Stars', updated: '按更新时间' },
  counts: { all: '全部 {n}', featured: '精选 {n}' },
  card: { featuredBadge: '精选', draftBadge: '未上架', stars: '{n} stars' },
  rowMenu: {
    edit: '编辑',
    feature: '加入精选',
    unfeature: '移出精选',
    publish: '上架到前台',
    unpublish: '从前台取下',
    openRepo: '打开仓库',
    moveUp: '上移一位',
    moveDown: '下移一位',
    remove: '删除项目',
  },
  /* 卡片右上角两个控件的无障碍名 */
  moreActions: '项目操作',
  dragHandle: '拖拽调整顺序',
  noDescription: '尚未填写简介',
  /* 操作回执。项目名一律带《》引起来 —— 同一屏里可能同时存在好几个项目 */
  featured: '已把《{title}》加入精选',
  unfeatured: '已把《{title}》移出精选',
  published: '《{title}》已上架到前台',
  unpublished: '《{title}》已从前台取下',
  deleted: '已删除《{title}》',
  orderSaved: '前台顺序已更新（{n} 个项目）',
  orderError: '顺序没能保存，已恢复到改动前的排列',
  empty: {
    all: '还没有项目',
    filtered: '这个语言下还没有项目',
    hint: '点右上角「新建项目」添加第一个',
  },
  footer: { summary: '共 {total} 个项目 · 精选 {featured} · 累计 {stars} stars' },
  error: '项目列表加载失败',
  retry: '重试',
  confirmRemoveTitle: '删除项目',
  confirmDelete: '删除后无法恢复，确定删除《{title}》？',
  /* 弹层 */
  dialog: {
    createTitle: '新建项目',
    editTitle: '编辑项目',
    subtitle: '名称与简介会出现在前台的卡片墙上',
    name: '项目名称',
    namePlaceholder: '例如：Android 长列表 A4 打印工具链',
    slug: '永久链接',
    slugPlaceholder: '留空自动生成',
    slugHint: '只能用英文小写、数字与连字符；留空表示不改',
    description: '项目简介',
    descriptionPlaceholder: '一两句话说明它解决什么问题',
    tags: '技术标签',
    tagsHint: '前台按「 · 」分隔展示，例如 TypeScript · adb · Pillow',
    language: '主要语言',
    languageNone: '暂不填写',
    languageOther: '其他语言…',
    languageNew: '新语言名称',
    languageNewPlaceholder: '例如 Kotlin',
    languageNewEmpty: '选了「其他语言」就要填一个名字',
    stars: 'Stars',
    forks: 'Forks',
    repoUrl: '仓库地址',
    repoUrlHint: '必须以 http:// 或 https:// 开头',
    featured: '在首页精选位展示',
    status: '上架状态',
    statusPublished: '已上架',
    statusDraft: '草稿（前台不可见）',
    cancel: '取消',
    save: '保存',
    creating: '创建中…',
    saving: '保存中…',
    created: '已创建《{title}》',
    saved: '已保存《{title}》',
    saveError: '保存失败',
  },
} as const
