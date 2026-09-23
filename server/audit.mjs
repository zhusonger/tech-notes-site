/**
 * 操作日志的动作目录与保留策略。
 *
 * 库里存的是动作码（`post_status`），界面要的是人话（《标题》草稿 → 已发布）。
 * 翻译放在服务端而不是前端，有两个理由：
 *   1. 动作码是服务端自己写进库的，改一处不必同步改前端；
 *   2. detail 字段的格式只有写入方知道（比如 `标题：published → draft`），
 *      前端拿到的如果只是一串文本，就只能原样展示 —— 包含英文状态码。
 *
 * 未登记的动作**回退成原始动作码**，不渲染成空白：新增动作时日志页不会静默丢行，
 * 而是显示一个还没翻译的码，一眼能看出该补目录了。
 */
import { all, get, run } from './db.mjs'

/** 日志保留天数。界面上的「日志保留 90 天」直接读这个常量，两处不会说岔。 */
export const RETENTION_DAYS = 90

const STATUS_TEXT = { published: '已发布', draft: '草稿', trash: '回收站' }

/** `标题：published → draft` → `《标题》已发布 → 草稿` */
function renderPostStatus(detail) {
  const m = String(detail ?? '').match(/^(.*?)：(\w+) → (\w+)$/)
  if (!m) return detail || '文章状态变更'
  return `《${m[1]}》${STATUS_TEXT[m[2]] ?? m[2]} → ${STATUS_TEXT[m[3]] ?? m[3]}`
}

/** `彻底删除：标题` → `彻底删除文章《标题》` */
function renderPostDelete(detail) {
  const m = String(detail ?? '').match(/^彻底删除：(.*)$/)
  return m ? `彻底删除文章《${m[1]}》` : detail || '彻底删除文章'
}

/**
 * `名称：旧 → 新` → `名称 · 旧 → 新`
 *
 * 注意这里必须解构 `{ detail }`：渲染器统一以**整行**为入参调用（见 describeAction），
 * 直接写 `(detail) => ...` 拿到的是整行对象 —— 而 node:sqlite 返回的是无原型对象，
 * 对它做 String() 会直接抛 TypeError。这个坑真的踩到过：一条 `post_status`
 * 就能让整个日志页 500。
 */
const suffixed = (noun) => ({ detail }) => {
  const text = String(detail ?? '').trim()
  return text ? `${noun} · ${text}` : noun
}

const renderers = {
  // ---- 登录与安全
  login: ({ result, detail }) => (result === 'failed' ? `登录失败${detail ? ` · ${detail}` : ''}` : '登录成功'),
  logout: () => '退出登录',
  '2fa_verify': ({ result }) => (result === 'failed' ? '两步验证未通过' : '通过两步验证登录'),
  recovery_code_login: ({ result }) => (result === 'failed' ? '恢复码登录失败' : '使用恢复码登录'),
  '2fa_setup': () => '开始绑定两步验证',
  '2fa_enable': () => '开启两步验证',
  '2fa_disable': () => '关闭两步验证',
  recovery_codes_regenerate: () => '重新生成恢复码',
  password_change: ({ result }) => (result === 'failed' ? '修改密码未通过' : '修改登录密码'),
  account_update: suffixed('更新账号资料'),
  session_revoke: suffixed('吊销登录设备'),
  bootstrap_admin: () => '初始化管理员账号',

  // ---- 内容
  post_status: ({ detail }) => renderPostStatus(detail),
  post_delete: ({ detail }) => renderPostDelete(detail),
  post_save: suffixed('保存文章'),
  /*
   * 批量动作与单条动作**分开记**：日志里翻到一条 post_bulk，就知道这一秒动了多篇，
   * 而不必去数一串同秒出现的单条记录。
   *
   * 名词刻意保持**宽**（「批量操作 X」而不是「批量删除 X」）：一个动作码对应一批
   * 语义相近的动作（发布 / 转草稿 / 回收 / 删除），具体做了什么写在 detail 里。
   * 若为每个动作各开一个码，日志页的动作筛选条会长成一整排几乎同名的选项，
   * 而翻日志的人真正想问的是「哪一次动了很多篇」，不是「那一次具体按了哪个钮」。
   */
  post_bulk: suffixed('批量操作文章'),
  project_create: suffixed('新建项目'),
  project_update: suffixed('更新项目'),
  project_delete: suffixed('删除项目'),
  project_bulk: suffixed('批量操作项目'),
  /* 拖拽排序一次性改动整份顺序，所以单独一个码：日志里翻到它就知道是顺序被动过 */
  project_reorder: suffixed('调整项目顺序'),
  media_upload: suffixed('上传媒体'),
  media_update: suffixed('修改媒体信息'),
  media_delete: suffixed('删除媒体'),
  media_bulk: suffixed('批量删除媒体'),
  resume_save: suffixed('更新简历'),

  // ---- 站点配置
  category_create: suffixed('新建分类'),
  category_update: suffixed('重命名分类'),
  category_delete: suffixed('删除分类'),
  /* 与 project_reorder 同理：一次改动整份顺序，单独一个码，翻日志时一眼能认出 */
  category_reorder: suffixed('调整分类顺序'),
  tag_create: suffixed('新建标签'),
  tag_rename: suffixed('重命名标签'),
  tag_delete: suffixed('删除标签'),
  tag_prune: suffixed('清理未使用标签'),
  tag_merge: suffixed('合并重复标签'),
  settings_update: suffixed('修改站点设置'),
  home_update: suffixed('更新首页内容'),

  // ---- 系统
  audit_prune: ({ detail }) => (detail ? `清理操作日志 · ${detail}` : '清理操作日志'),
}

/**
 * 把一条审计行翻成给人看的句子。
 * 返回 `{ text, known }`：`known=false` 表示这个动作码还没登记进目录。
 *
 * 渲染器抛错时回退成原始动作码，而不是把异常抛给调用方：
 * 日志页的价值在于「能翻出历史」，一条格式意外的旧记录不该让整页打不开。
 */
export function describeAction(row) {
  const fn = renderers[row.action]
  if (!fn) return { text: row.action, known: false }
  try {
    const text = fn(row)
    return { text: text || row.action, known: true }
  } catch {
    return { text: row.action, known: false }
  }
}

/** 操作者下拉的候选项：按最近出现排序，只取有名字的。 */
export function actorOptions() {
  return all(
    `SELECT actor, COUNT(*) AS n, MAX(created_at) AS last
     FROM audit_logs
     WHERE actor IS NOT NULL AND actor <> '' AND actor <> 'system'
     GROUP BY actor
     ORDER BY last DESC
     LIMIT 20`
  ).map((r) => ({ value: r.actor, count: r.n }))
}

/** 各结果的条数，用于「全部 / 成功 / 失败」三个筛选项上的计数。 */
export function resultCounts() {
  const row = get(
    `SELECT COUNT(*) AS total,
            SUM(CASE WHEN result = 'success' THEN 1 ELSE 0 END) AS success,
            SUM(CASE WHEN result = 'failed'  THEN 1 ELSE 0 END) AS failed
     FROM audit_logs`
  )
  return { all: row?.total ?? 0, success: row?.success ?? 0, failed: row?.failed ?? 0 }
}

/** 超出保留期的条数。用于在界面上如实说明「有多少是待清理的」。 */
export function expiredCount(days = RETENTION_DAYS) {
  const cutoff = new Date(Date.now() - days * 86400000).toISOString()
  return get('SELECT COUNT(*) AS n FROM audit_logs WHERE created_at < ?', cutoff)?.n ?? 0
}

/**
 * 清理超出保留期的日志。
 *
 * 这是**唯一**会删审计记录的地方，所以刻意不做成后台定时任务：
 * 悄悄删掉证据比留着更危险，删多少、什么时候删都应当看得见。
 * 启动时调用一次（对齐界面上「保留 90 天」的承诺），手动清理也走同一个函数。
 */
export function pruneAuditLogs(days = RETENTION_DAYS) {
  const cutoff = new Date(Date.now() - days * 86400000).toISOString()
  const before = get('SELECT COUNT(*) AS n FROM audit_logs')?.n ?? 0
  run('DELETE FROM audit_logs WHERE created_at < ?', cutoff)
  const after = get('SELECT COUNT(*) AS n FROM audit_logs')?.n ?? 0
  return { removed: before - after, cutoff }
}
