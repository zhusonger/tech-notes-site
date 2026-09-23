/**
 * 站点设置的声明式规格。
 *
 * 后台「站点设置」页有 5 个分区、20 多个字段，全是对 `site_settings` 的键值读写。
 * 给每个字段写一遍「读、校验、写」既啰嗦又容易漏校验，所以这里只声明差异
 * （标签、类型、约束、提示），读写与校验各写一次。
 *
 * 两处与画布的差异，都是为了不留孤儿字段：
 * - 画布「基础信息」只有 7 个字段，但 `site_settings` 里还有标语、页脚说明等
 *   真实在用（或即将在用）的键。藏起来等于让它们无法维护，所以一并列出。
 * - 画布「集成与密钥」暗示是可编辑的密钥输入框，但本站**没有**任何第三方集成，
 *   凭空造几个假的密钥字段会让人以为配了就能生效。该分区改为展示真实的运行信息
 *   （密钥是否已配置、数据库落点与体积、运行版本），并明确说明尚无集成可配。
 */
import { all, getSetting, localDay, nowIso, run } from './db.mjs'

const TZ_OPTIONS = [
  { value: 'Asia/Shanghai', label: 'Asia/Shanghai（GMT+8）' },
  { value: 'Asia/Tokyo', label: 'Asia/Tokyo（GMT+9）' },
  { value: 'UTC', label: 'UTC（GMT+0）' },
]

const LANG_OPTIONS = [
  { value: 'zh-CN', label: '简体中文' },
  { value: 'en', label: 'English' },
]

export const SETTINGS_GROUPS = [
  {
    key: 'basic',
    label: '基础信息',
    subtitle: '站点名称、描述与语言等全局信息，会同步到前台页面与搜索结果',
    fields: [
      { key: 'brand', label: '站点名称', type: 'text', max: 60, placeholder: 'Tech Notes' },
      {
        key: 'description',
        label: '站点描述',
        type: 'textarea',
        rows: 3,
        max: 200,
        hint: '搜索结果与分享卡片的默认摘要',
      },
      { key: 'tagline', label: '标语', type: 'text', max: 40, hint: '首页 Hero 的一句话主张' },
      { key: 'language', label: '站点语言', type: 'select', options: LANG_OPTIONS },
      {
        key: 'timezone',
        label: '时区',
        type: 'select',
        options: TZ_OPTIONS,
        hint: '影响后台时间显示与「按天」统计的口径（需重启服务生效）',
      },
      { key: 'footerNote', label: '页脚说明', type: 'textarea', rows: 2, max: 200 },
      { key: 'footerQuote', label: '页脚寄语', type: 'text', max: 60 },
      { key: 'copyright', label: '页脚版权信息', type: 'text', max: 120 },
      { key: 'logo', label: '站点 Logo', type: 'url', max: 300, hint: '图片地址；填相对路径（如 /images/logo.png）或完整 URL' },
      {
        key: 'maintenance',
        label: '维护模式',
        type: 'switch',
        hint: '开启后前台访客只看到维护提示；后台与接口不受影响',
        /** 已真实生效（见 server/index.mjs 的静态中间件）—— 不是占了位不干的开关。 */
        effective: true,
      },
      {
        key: 'weeklyTarget',
        label: '每周发布目标',
        type: 'number',
        min: 1,
        max: 99,
        hint: '仪表盘「本周进度」的分母',
      },
    ],
  },
  {
    key: 'seo',
    label: 'SEO 与元信息',
    subtitle: '让搜索结果与社交分享卡片能正确描述这个站点',
    fields: [
      { key: 'seoTitle', label: '默认 SEO 标题', type: 'text', max: 90, hint: '留空则回退为站点名称' },
      { key: 'seoDescription', label: '默认 SEO 描述', type: 'textarea', rows: 3, max: 200, hint: '建议 120–160 字（含空格）' },
      { key: 'seoKeywords', label: '关键词', type: 'text', max: 200, hint: '英文逗号分隔' },
      { key: 'ogImage', label: '分享卡片图', type: 'url', max: 300, hint: '建议 1200×630，用于社交平台预览' },
    ],
  },
  {
    key: 'domain',
    label: '域名与部署',
    subtitle: '站点对外地址与代码仓库，用于生成绝对链接与排查部署问题',
    fields: [
      { key: 'siteUrl', label: '站点域名', type: 'url', max: 200, placeholder: 'https://notes.example.com' },
      { key: 'repoUrl', label: '代码仓库', type: 'url', max: 200, placeholder: 'https://github.com/your-name/your-repo' },
    ],
  },
  {
    key: 'author',
    label: '作者资料',
    /*
     * 城市与教育背景放在这一组，而不是另开一个分区。
     *
     * 它们是**站点级事实**：首页「关于我」名片、文章作者卡与简历页抬头共用同一份
     * （见 `shared/content.mjs` 的注释），所以只能有一个编辑入口 —— 就是这里。
     * 此前它们只有种子值、没有任何编辑入口，简历屏里的「去站点设置修改」就会指到
     * 一个没有该字段的页面。分组子标题里写清了它们会出现在哪几处。
     */
    subtitle: '出现在页脚、关于区块、文章署名与简历页抬头',
    fields: [
      { key: 'author', label: '姓名', type: 'text', max: 40 },
      { key: 'role', label: '职位', type: 'text', max: 60 },
      { key: 'location', label: '所在城市', type: 'text', max: 40 },
      { key: 'email', label: '邮箱', type: 'text', max: 120 },
      { key: 'github', label: 'GitHub', type: 'text', max: 120, hint: '只填用户名或域名后的路径即可' },
      { key: 'avatar', label: '头像地址', type: 'url', max: 300 },
      { key: 'bio', label: '个人简介', type: 'textarea', rows: 3, max: 300 },
      { key: 'educationSchool', label: '学校', type: 'text', max: 60, hint: '首页「关于我」与简历页共用这一份' },
      { key: 'educationMajor', label: '专业 / 学历', type: 'text', max: 80 },
      { key: 'educationDate', label: '毕业时间', type: 'text', max: 40 },
      { key: 'educationCert', label: '证书', type: 'text', max: 120 },
    ],
  },
]

/** 可编辑字段的扁平索引：key → { type, ... }，写入校验按它走。 */
const FIELD_INDEX = new Map()
for (const group of SETTINGS_GROUPS) {
  for (const field of group.fields) FIELD_INDEX.set(field.key, { ...field, group: group.key })
}

const BOOL_KEYS = new Set(
  SETTINGS_GROUPS.flatMap((g) => g.fields.filter((f) => f.type === 'switch').map((f) => f.key))
)

/** 开关的存量：早期种子没有这些键，读不到时按 false。 */
export const readBool = (key) => getSetting(key, '0') === '1'

/**
 * 按声明校验并强制转换一个字段值。
 * 返回 `{ ok: true, value }` 或 `{ ok: false, error }` —— 错误文案直接给用户看。
 */
function coerce(field, raw) {
  const label = field.label

  if (field.type === 'switch') {
    return { ok: true, value: raw === true || raw === '1' || raw === 1 ? '1' : '0' }
  }

  const text = String(raw ?? '').trim()

  if (field.type === 'number') {
    if (!/^\d+$/.test(text)) return { ok: false, error: `${label} 需要是正整数` }
    const n = Number.parseInt(text, 10)
    if (field.min !== undefined && n < field.min) return { ok: false, error: `${label} 不能小于 ${field.min}` }
    if (field.max !== undefined && n > field.max) return { ok: false, error: `${label} 不能大于 ${field.max}` }
    return { ok: true, value: String(n) }
  }

  if (field.type === 'select') {
    const allowed = field.options.map((o) => o.value)
    if (!allowed.includes(text)) return { ok: false, error: `${label} 的取值不在允许范围内` }
    return { ok: true, value: text }
  }

  if (field.type === 'url' && text) {
    // 允许相对路径（本站静态资源）与 http(s) 绝对地址，其余一律拒绝。
    if (!/^(https?:\/\/|\/)/i.test(text)) {
      return { ok: false, error: `${label} 需要以 http(s):// 或 / 开头` }
    }
  }

  if (field.max !== undefined && text.length > field.max) {
    return { ok: false, error: `${label} 最多 ${field.max} 个字符` }
  }

  return { ok: true, value: text }
}

/** 读全量设置：分组、字段、当前值、该分区最近一次保存时间。 */
export function readSettings() {
  const rows = all('SELECT key, value, updated_at FROM site_settings')
  const valueOf = new Map(rows.map((r) => [r.key, r.value]))
  const savedOf = new Map(rows.map((r) => [r.key, r.updated_at]))

  const groups = SETTINGS_GROUPS.map((group) => {
    let savedAt = ''
    for (const field of group.fields) {
      const at = savedOf.get(field.key) ?? ''
      if (at > savedAt) savedAt = at
    }
    return {
      key: group.key,
      label: group.label,
      subtitle: group.subtitle,
      savedAt: savedAt || null,
      fields: group.fields.map((field) => ({
        key: field.key,
        label: field.label,
        type: field.type,
        hint: field.hint ?? null,
        placeholder: field.placeholder ?? null,
        options: field.options ?? null,
        rows: field.rows ?? null,
        max: field.max ?? null,
        effective: Boolean(field.effective),
        value: field.type === 'switch' ? valueOf.get(field.key) === '1' : (valueOf.get(field.key) ?? ''),
      })),
    }
  })

  return { groups, unknownCount: 0 }
}

/**
 * 写入若干设置项。
 *
 * 只接受声明过的键：未声明的键会**报错而不是静默丢弃** —— 前端拼错字段名时
 * 应当立刻失败，而不是看到「保存成功」却发现值没变。
 */
export function writeSettings(patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
    return { ok: false, error: '请求体需要是「字段 → 值」的对象' }
  }

  const keys = Object.keys(patch)
  if (keys.length === 0) return { ok: false, error: '没有需要保存的字段' }

  const unknown = keys.filter((k) => !FIELD_INDEX.has(k))
  if (unknown.length) {
    return { ok: false, error: `不认识的设置项：${unknown.join('、')}` }
  }

  const staged = []
  for (const key of keys) {
    const field = FIELD_INDEX.get(key)
    const result = coerce(field, patch[key])
    if (!result.ok) return { ok: false, error: result.error }
    staged.push({ key, value: result.value, previous: getSetting(key, '') })
  }

  const changed = staged.filter((s) => s.previous !== s.value)
  if (changed.length === 0) {
    return { ok: true, changed: [], groups: readSettings().groups }
  }

  for (const item of changed) {
    run(
      `INSERT INTO site_settings (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      item.key,
      item.value,
      nowIso()
    )
  }

  return {
    ok: true,
    changed: changed.map((c) => ({ key: c.key, label: FIELD_INDEX.get(c.key).label, from: c.previous, to: c.value })),
    groups: readSettings().groups,
  }
}

/** 审计日志里记什么。只记字段名与所属分区，**不记值** —— 密钥类字段将来若加进来，不会随日志外流。 */
export function describeSettingsChange(changed) {
  if (!changed.length) return '无变化'
  const groups = [...new Set(changed.map((c) => SETTINGS_GROUPS.find((g) => g.fields.some((f) => f.key === c.key))?.label).filter(Boolean))]
  const labels = changed.map((c) => c.label)
  const shown = labels.slice(0, 4).join('、')
  return `${groups.join(' / ')}：${shown}${labels.length > 4 ? ` 等 ${labels.length} 项` : ''}`
}

/**
 * 「集成与密钥」分区。
 *
 * 不是 `site_settings` 里的键，而是运行期事实的只读快照 —— 所以单独构造，
 * 免得混进可写字段的规格里被误当成可编辑项。
 */
export function systemGroup(facts) {
  return {
    key: 'integrations',
    label: '集成与密钥',
    subtitle: '运行期信息与密钥状态。这些是只读的系统事实，不是可以填写的配置项',
    savedAt: null,
    readOnly: true,
    fields: [
      {
        key: '_appSecret',
        label: '应用密钥',
        type: 'readonly',
        value: facts.appSecretConfigured ? '已配置 · 独立存放且不可读取' : '未配置',
        hint: '用于加密两步验证密钥与生成访客哈希。只显示状态，值本身不经过接口',
      },
      { key: '_database', label: '数据库文件', type: 'readonly', value: facts.dbPath, hint: facts.dbSizeLabel },
      { key: '_uploads', label: '上传目录', type: 'readonly', value: facts.uploadDir, hint: `已占用 ${facts.uploadSizeLabel}` },
      { key: '_runtime', label: '运行环境', type: 'readonly', value: facts.runtime, hint: `启动于 ${facts.startedAt}` },
      { key: '_timezone', label: '生效时区', type: 'readonly', value: facts.timezone, hint: `当前本地日 ${localDay()}` },
    ],
    notice: '本站尚未接入任何第三方集成（无邮件服务、无对象存储、无统计平台）。此处不提供空的密钥输入框 —— 能填但不生效的字段比缺字段更难排查。',
  }
}

export { BOOL_KEYS }
