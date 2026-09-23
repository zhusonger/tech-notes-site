/**
 * 后台 API。
 *
 * 约定：
 * - 全部挂在 `/api/admin` 下；未登录一律 401（登录/2FA/恢复码三个端点除外）。
 * - 所有写操作都落 `audit_logs`（成功与失败都记），这是「操作日志」页唯一的数据来源。
 * - 错误响应统一 `{ error: string }`，前端只展示这一条文案，不再二次加工。
 */
import express from 'express'
import rateLimit from 'express-rate-limit'
import QRCode from 'qrcode'
import { readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import {
  APP_SECRET_FILE,
  APP_SECRET_SOURCE,
  checkPasswordStrength,
  consumeLoginTicket,
  consumeRecoveryCode,
  createLoginTicket,
  createSession,
  destroySession,
  generateRecoveryCodes,
  hashPassword,
  listSessions,
  readLoginTicket,
  recoveryCodeStats,
  requireAuth,
  revokeSession,
  twoFactor,
  verifyPassword,
  writeAudit,
} from './auth.mjs'
import {
  RETENTION_DAYS,
  actorOptions,
  describeAction,
  expiredCount,
  pruneAuditLogs,
  resultCounts,
} from './audit.mjs'
import {
  VISITOR_RETENTION_DAYS,
  all,
  dbPath,
  formatLocal,
  get,
  getSetting,
  localDay,
  localDayOffset,
  nowIso,
  projectRoot,
  run,
  setSetting,
  slugify,
  tx,
  uniqueSlug,
} from './db.mjs'
import { describeSettingsChange, readSettings, systemGroup, writeSettings } from './settings.mjs'
import { describeSectionChange, readSectionsAdmin, validateSection, writeSection } from './sections.mjs'
import {
  MEDIA_POLICY,
  MEDIA_SORT_OPTIONS,
  mediaDeleteBlock,
  mediaFacets,
  mediaItemOf,
  originOf,
  readMediaAdmin,
  referenceIndex,
  referencesOf,
  removeMediaFile,
  saveUpload,
  validateMediaPayload,
} from './media.mjs'
import { MEDIA_KINDS, MAX_UPLOAD_BYTES } from '../shared/media.mjs'
/* 分类与标签的域逻辑：改名连带改文章、删除先看占用、近重复合并都在那里 */
import {
  categoryItems,
  createCategory,
  createTag,
  deleteCategory,
  deleteTag,
  deleteUnusedTags,
  mergeDuplicateTags,
  readTaxonomyAdmin,
  renameCategory,
  renameTag,
  reorderCategories,
  taxonomyFacets,
} from './taxonomy.mjs'
/* 阅读时长与 stars 计数都由内容派生，服务端与前台必须同一口径 —— 因此复用 shared/ 里的那两个函数 */
import { readingLabel } from '../shared/derive.mjs'
/* 区块的可编辑键与模块归属也来自 shared/：界面上的模块页签与这里的白名单是同一份 */
import { SECTION_MODULES, getSectionSpec } from '../shared/sections.mjs'
/* 访客的地区（ip2region 离线库）与设备（UA 规则）都在 server 侧解析，前端只负责渲染结论 */
import { ensureGeo, geoReady, geoState, regionOf } from './geo.mjs'
import { deviceOf } from './ua.mjs'

export const api = express.Router()

/**
 * TOTP 的发行方名称。
 *
 * 从库里读而不是写死：它显示在验证器 App 的账号条目上（`发行方 (邮箱)`），
 * 站点改名后还挂着旧名字，会让人认不出这条验证码属于哪个站点。
 *
 * 改这个值**不会**让已绑定的验证器失效 —— TOTP 的密钥不在发行方字段里，
 * 换掉的只是 App 里显示的标签。
 */
const issuerOf = () => `${getSetting('brand', 'Tech Notes')} 后台`

const clientMeta = (req) => ({ ip: req.ip, userAgent: req.get('user-agent') })

/**
 * 列表里的时间标签，按画布口径：今天/昨天用相对说法，更早的用 MM-DD HH:mm。
 * 文章列表与操作日志共用同一口径 —— 同一屏里出现两种时间写法最容易被读错。
 */
function listTimeLabel(iso) {
  const full = formatLocal(iso)
  if (!full) return ''
  const day = full.slice(0, 10)
  const time = full.slice(11)
  if (day === localDay()) return `今天 ${time}`
  if (day === localDayOffset(1)) return `昨天 ${time}`
  return `${day.slice(5)} ${time}`
}

const asUser = (row) => ({
  id: row.id,
  email: row.email,
  displayName: row.display_name,
  role: row.role,
  avatarUrl: row.avatar_url,
  mustChangePassword: Boolean(row.must_change_password),
})

function findUserByEmail(email) {
  return get('SELECT * FROM users WHERE lower(email) = lower(?)', String(email ?? '').trim())
}

// ------------------------------------------------------------------- 限流
const loginLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 8,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: '尝试次数过多，请 10 分钟后再试' },
})

const twoFaLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 12,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: '验证尝试过于频繁，请稍后再试' },
})

const sensitiveLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: '操作过于频繁，请稍后再试' },
})

// ------------------------------------------------------------------- 健康检查
api.get('/health', (_req, res) => res.json({ ok: true, ts: nowIso() }))

// ------------------------------------------------------------------- 登录
api.post('/admin/login', loginLimiter, async (req, res) => {
  const { email, password, remember } = req.body ?? {}
  const user = findUserByEmail(email)

  // 账号不存在时也走一次等价开销的校验，避免用响应时间区分「邮箱存在与否」
  const ok = user
    ? await verifyPassword(password, user.password_hash, user.password_salt)
    : await verifyPassword(password, 'x'.repeat(128), 'decoy')

  if (!user || !ok) {
    writeAudit({
      actor: String(email ?? '').slice(0, 120) || 'unknown',
      action: 'login',
      targetType: 'user',
      detail: user ? '密码错误' : '账号不存在',
      result: 'failed',
      req,
    })
    return res.status(401).json({ error: '邮箱或密码不正确' })
  }

  const twofa = twoFactor.read(user.id)
  if (twofa?.enabled && twofa.secret) {
    // 密码通过但还不能发会话：先给一张 5 分钟的一次性凭证
    const ticket = createLoginTicket(user, { remember: Boolean(remember), ...clientMeta(req) })
    writeAudit({
      userId: user.id,
      actor: user.email,
      action: 'login',
      targetType: 'user',
      targetId: String(user.id),
      detail: '密码校验通过，等待两步验证',
      req,
    })
    return res.json({ stage: '2fa', ticket })
  }

  issueSession(res, user, Boolean(remember), req)
})

api.post('/admin/2fa/verify', twoFaLimiter, async (req, res) => {
  const { ticket, code } = req.body ?? {}
  const row = readLoginTicket(ticket)
  if (!row) return res.status(401).json({ error: '验证已超时，请重新登录' })

  const twofa = twoFactor.read(row.user_id)
  if (!twofa?.secret) return res.status(400).json({ error: '该账号未绑定两步验证' })

  if (!(await twoFactor.check(code, twofa.secret))) {
    writeAudit({
      userId: row.user_id,
      actor: row.email,
      action: '2fa_verify',
      detail: '验证码错误',
      result: 'failed',
      req,
    })
    return res.status(401).json({ error: '验证码错误，请重新输入' })
  }

  consumeLoginTicket(row.ticket_id)
  writeAudit({ userId: row.user_id, actor: row.email, action: '2fa_verify', req })
  issueSession(res, row, Boolean(row.remember), req)
})

api.post('/admin/2fa/recovery', twoFaLimiter, (req, res) => {
  const { ticket, code } = req.body ?? {}
  const row = readLoginTicket(ticket)
  if (!row) return res.status(401).json({ error: '验证已超时，请重新登录' })

  if (!consumeRecoveryCode(row.user_id, code)) {
    writeAudit({
      userId: row.user_id,
      actor: row.email,
      action: 'recovery_code_login',
      detail: '恢复码无效',
      result: 'failed',
      req,
    })
    return res.status(401).json({ error: '恢复码无效或已被使用' })
  }

  consumeLoginTicket(row.ticket_id)
  writeAudit({
    userId: row.user_id,
    actor: row.email,
    action: 'recovery_code_login',
    detail: '使用恢复码登录，剩余恢复码已减少',
    req,
  })
  issueSession(res, row, Boolean(row.remember), req, { recoveryWarning: true })
})

api.post('/admin/logout', (req, res) => {
  if (req.user) {
    writeAudit({
      userId: req.user.id,
      actor: req.user.email,
      action: 'logout',
      targetType: 'session',
      targetId: String(req.sessionId ?? ''),
      req,
    })
  }
  destroySession(req.cookies?.tn_admin)
  clearSessionCookie(res)
  res.json({ ok: true })
})

/**
 * 签发会话并写 Cookie。
 * 2FA 尚未绑定时不拦登录：绑定入口在「账号安全」页，绑之前先生效的是密码这一层。
 */
function issueSession(res, user, remember, req, extra = {}) {
  const { token, maxAgeSeconds } = createSession(user, { remember, ...clientMeta(req) })
  res.cookie('tn_admin', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: secureCookie(req),
    path: '/',
    maxAge: maxAgeSeconds * 1000,
  })
  writeAudit({ userId: user.id, actor: user.email, action: 'login', detail: '登录成功', req })
  res.json({
    stage: 'done',
    user: asUser(user),
    twoFactorEnabled: Boolean(twoFactor.read(user.id)?.enabled),
    ...extra,
  })
}

const secureCookie = (req) =>
  process.env.COOKIE_SECURE === '1' ||
  req.secure ||
  req.get('x-forwarded-proto') === 'https'

function clearSessionCookie(res) {
  res.clearCookie('tn_admin', { path: '/' })
}

// ------------------------------------------------------------------- 会话
api.get('/admin/me', requireAuth, (req, res) => {
  const twofa = twoFactor.read(req.user.id)
  res.json({
    user: req.user,
    twoFactor: {
      enabled: Boolean(twofa?.enabled),
      deviceLabel: twofa?.deviceLabel ?? null,
      confirmedAt: twofa?.confirmedAt ?? null,
    },
    serverTime: nowIso(),
  })
})

// ------------------------------------------------------------------- 账号
api.get('/admin/account', requireAuth, (req, res) => {
  const row = get('SELECT created_at, updated_at FROM users WHERE id = ?', req.user.id)
  res.json({
    user: req.user,
    createdAt: row?.created_at ?? null,
    updatedAt: row?.updated_at ?? null,
  })
})

api.patch('/admin/account', requireAuth, (req, res) => {
  const displayName = String(req.body?.displayName ?? '').trim()
  if (displayName.length < 1 || displayName.length > 40) {
    return res.status(400).json({ error: '显示名称需为 1–40 个字符' })
  }
  run('UPDATE users SET display_name = ?, updated_at = ? WHERE id = ?', displayName, nowIso(), req.user.id)
  writeAudit({
    userId: req.user.id,
    actor: req.user.email,
    action: 'account_update',
    targetType: 'user',
    targetId: String(req.user.id),
    detail: `显示名称 → ${displayName}`,
    req,
  })
  const row = get('SELECT * FROM users WHERE id = ?', req.user.id)
  res.json({ user: asUser(row), updatedAt: row.updated_at })
})

api.post('/admin/account/password', requireAuth, sensitiveLimiter, async (req, res) => {
  const { currentPassword, newPassword } = req.body ?? {}
  const row = get('SELECT * FROM users WHERE id = ?', req.user.id)
  if (!(await verifyPassword(currentPassword, row.password_hash, row.password_salt))) {
    writeAudit({
      userId: req.user.id,
      actor: req.user.email,
      action: 'password_change',
      detail: '当前密码不正确',
      result: 'failed',
      req,
    })
    return res.status(401).json({ error: '当前密码不正确' })
  }
  const weak = checkPasswordStrength(newPassword)
  if (weak) return res.status(400).json({ error: weak })

  const { hash, salt } = await hashPassword(newPassword)
  run(
    'UPDATE users SET password_hash = ?, password_salt = ?, must_change_password = 0, updated_at = ? WHERE id = ?',
    hash,
    salt,
    nowIso(),
    req.user.id
  )
  // 改密后踢掉除当前会话以外的所有设备
  run('DELETE FROM sessions WHERE user_id = ? AND id != ?', req.user.id, req.sessionId ?? -1)
  writeAudit({
    userId: req.user.id,
    actor: req.user.email,
    action: 'password_change',
    targetType: 'user',
    targetId: String(req.user.id),
    detail: '已修改登录密码，其他设备会话已失效',
    req,
  })
  res.json({ ok: true })
})

// ------------------------------------------------------------------- 2FA
api.get('/admin/2fa/status', requireAuth, (req, res) => {
  const twofa = twoFactor.read(req.user.id)
  res.json({
    enabled: Boolean(twofa?.enabled),
    deviceLabel: twofa?.deviceLabel ?? null,
    confirmedAt: twofa?.confirmedAt ?? null,
    recovery: recoveryCodeStats(req.user.id),
  })
})

api.post('/admin/2fa/setup', requireAuth, sensitiveLimiter, async (req, res) => {
  const existing = twoFactor.read(req.user.id)
  if (existing?.enabled) {
    return res.status(409).json({ error: '两步验证已启用，请先关闭再重新绑定' })
  }
  const secret = twoFactor.newSecret()
  twoFactor.saveSecret(req.user.id, secret)
  const otpauth = twoFactor.uri(secret, req.user.email, issuerOf())
  const qrDataUrl = await QRCode.toDataURL(otpauth, { margin: 1, width: 264 })
  writeAudit({ userId: req.user.id, actor: req.user.email, action: '2fa_setup', req })
  // secret 只在本次返回，用于扫码失败时手动录入
  res.json({ secret, otpauth, qrDataUrl })
})

api.post('/admin/2fa/enable', requireAuth, sensitiveLimiter, async (req, res) => {
  const { code, deviceLabel } = req.body ?? {}
  const twofa = twoFactor.read(req.user.id)
  if (!twofa?.secret) return res.status(400).json({ error: '请先生成两步验证密钥' })
  if (!(await twoFactor.check(code, twofa.secret))) {
    writeAudit({
      userId: req.user.id,
      actor: req.user.email,
      action: '2fa_enable',
      detail: '验证码错误',
      result: 'failed',
      req,
    })
    return res.status(401).json({ error: '验证码错误，请确认认证器时间已同步' })
  }
  twoFactor.setEnabled(req.user.id, true, String(deviceLabel ?? '').trim() || '认证器应用')
  const codes = generateRecoveryCodes(req.user.id)
  writeAudit({
    userId: req.user.id,
    actor: req.user.email,
    action: '2fa_enable',
    detail: '两步验证已启用并生成 8 个恢复码',
    req,
  })
  // 恢复码明文只在此刻返回一次
  res.json({ ok: true, recoveryCodes: codes })
})

api.post('/admin/2fa/disable', requireAuth, sensitiveLimiter, async (req, res) => {
  const row = get('SELECT * FROM users WHERE id = ?', req.user.id)
  if (!(await verifyPassword(req.body?.password, row.password_hash, row.password_salt))) {
    writeAudit({
      userId: req.user.id,
      actor: req.user.email,
      action: '2fa_disable',
      detail: '密码校验失败',
      result: 'failed',
      req,
    })
    return res.status(401).json({ error: '密码不正确，无法关闭两步验证' })
  }
  twoFactor.clear(req.user.id)
  writeAudit({
    userId: req.user.id,
    actor: req.user.email,
    action: '2fa_disable',
    detail: '两步验证已关闭，恢复码一并作废',
    req,
  })
  res.json({ ok: true })
})

api.post('/admin/2fa/recovery-codes', requireAuth, sensitiveLimiter, async (req, res) => {
  const row = get('SELECT * FROM users WHERE id = ?', req.user.id)
  if (!(await verifyPassword(req.body?.password, row.password_hash, row.password_salt))) {
    writeAudit({
      userId: req.user.id,
      actor: req.user.email,
      action: 'recovery_codes_regenerate',
      detail: '密码校验失败',
      result: 'failed',
      req,
    })
    return res.status(401).json({ error: '密码不正确' })
  }
  const codes = generateRecoveryCodes(req.user.id)
  writeAudit({
    userId: req.user.id,
    actor: req.user.email,
    action: 'recovery_codes_regenerate',
    detail: '已重新生成恢复码，旧恢复码全部作废',
    req,
  })
  res.json({ ok: true, recoveryCodes: codes })
})

// ------------------------------------------------------------------- 登录设备
api.get('/admin/sessions', requireAuth, (req, res) => {
  const rows = listSessions(req.user.id).map((s) => ({
    id: s.id,
    current: s.id === req.sessionId,
    remember: Boolean(s.remember),
    userAgent: s.user_agent ?? '',
    ip: s.ip ?? '',
    createdAt: formatLocal(s.created_at),
    lastSeenAt: formatLocal(s.last_seen_at),
    expiresAt: formatLocal(s.expires_at),
  }))
  res.json({ sessions: rows })
})

api.delete('/admin/sessions/:id', requireAuth, (req, res) => {
  const id = Number.parseInt(req.params.id, 10)
  if (!Number.isFinite(id)) return res.status(400).json({ error: '会话 ID 不合法' })
  const ok = revokeSession(req.user.id, id)
  writeAudit({
    userId: req.user.id,
    actor: req.user.email,
    action: 'session_revoke',
    targetType: 'session',
    targetId: String(id),
    detail: ok ? '已吊销该登录设备' : '目标会话不存在',
    result: ok ? 'success' : 'failed',
    req,
  })
  if (!ok) return res.status(404).json({ error: '该会话不存在或已被吊销' })
  res.json({ ok: true })
})

// ------------------------------------------------------------------- 访客记录
/**
 * 访客记录页的数据源。
 *
 * 与仪表盘的「独立访客」不是同一件事：仪表盘读 page_views 的匿名哈希，只出计数；
 * 这里读 visitor_logs，落的是明文 IP 与 UA，所以能给出地区与设备。
 * 正因为它更「重」，只按需分页读，并受独立的保留期约束（VISITOR_RETENTION_DAYS）。
 *
 * 地区与设备在服务端解析后送出：xdb 与 UA 规则都住在 server/，
 * 前端应当拿到可以直接渲染的结论，而不是一堆还要再解释一遍的原始字段。
 */
const VISITOR_RANGES = [1, 7, 30, 0] // 0 = 全部（仍受 30 天保留期约束）

api.get('/admin/visitors', requireAuth, (req, res) => {
  /*
   * 地区库不随镜像分发（11 MB，不值得为它让每次构建都联网），所以这一页是它
   * 唯一的触发点：缺库就在后台拉一次，落到持久化目录。
   *
   * 刻意不 await —— 本次请求照常返回（地区列先空着），下载完成后下次访问
   * 就能看到。为了多一列地区让这一页等十几秒，是更糟的取舍。
   */
  ensureGeo()

  const rangeRaw = Number.parseInt(req.query.range ?? '7', 10)
  const range = VISITOR_RANGES.includes(rangeRaw) ? rangeRaw : 7
  const keyword = String(req.query.keyword ?? '').trim().slice(0, 64)
  const perPage = Math.min(Math.max(Number.parseInt(req.query.perPage ?? '20', 10) || 20, 1), 100)

  const where = []
  const params = []
  if (range > 0) {
    where.push('created_at >= ?')
    params.push(new Date(Date.now() - range * 86400000).toISOString())
  }
  if (keyword) {
    where.push('ip LIKE ?')
    params.push(`%${keyword}%`)
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''

  // 分页数是「独立 IP 数」而不是记录条数：列表一行就是一个访客，页码必须与行数对齐
  const total = get(`SELECT COUNT(DISTINCT ip) AS n FROM visitor_logs ${whereSql}`, ...params)?.n ?? 0
  const totalPages = Math.max(Math.ceil(total / perPage), 1)
  // 越界页码收敛到最后一页：从新到旧翻页时，旧链接不该因为记录被清理过就报错
  const page = Math.min(Math.max(Number.parseInt(req.query.page ?? '1', 10) || 1, 1), totalPages)

  /*
   * `last_ua` 用相关子查询取该 IP「最后一次」访问的 UA，而不是 GROUP_CONCAT 全部。
   * 设备这一列要回答的是「这个人现在用什么设备」；把历史上所有设备串在一起，
   * 一列里塞四五个浏览器名反而读不出结论。
   */
  const rows = all(
    `SELECT ip,
            COUNT(*)            AS views,
            COUNT(DISTINCT day) AS days,
            MIN(created_at)     AS first_at,
            MAX(created_at)     AS last_at,
            (SELECT ua FROM visitor_logs v2 WHERE v2.ip = v1.ip ORDER BY v2.id DESC LIMIT 1) AS last_ua
     FROM visitor_logs v1 ${whereSql}
     GROUP BY ip
     ORDER BY last_at DESC
     LIMIT ? OFFSET ?`,
    ...params,
    perPage,
    (page - 1) * perPage
  )

  // 总浏览数单独算：上面那次 COUNT 数的是 IP，不能拿来当 PV
  const views = get(`SELECT COUNT(*) AS n FROM visitor_logs ${whereSql}`, ...params)?.n ?? 0

  res.json({
    items: rows.map((r) => ({
      ip: r.ip,
      /** null 表示离线库缺失，或该地址不属于可解析范围（IPv6 暂不支持） */
      region: regionOf(r.ip),
      device: deviceOf(r.last_ua),
      views: r.views,
      days: r.days,
      firstAt: r.first_at,
      firstLabel: listTimeLabel(r.first_at),
      lastAt: r.last_at,
      lastLabel: listTimeLabel(r.last_at),
    })),
    total,
    views,
    page,
    perPage,
    totalPages,
    range,
    keyword,
    retentionDays: VISITOR_RETENTION_DAYS,
    /**
     * 地区库的运行期事实，**供脚本与运维诊断**，界面不再就此弹提示
     * （地区列空着就是空着，不额外解释 —— 库几秒后自己就位）。
     *
     * 之所以仍留在响应里：出问题时只有这里有答案。geoReady=false 说明这次
     * 地区列会是空的；geoState 再区分「正在获取」与「获取失败」—— 前者几秒后
     * 刷新即见，后者才需要去翻服务端日志（镜像源是否可达）。混成一句
     * 「不可用」会让人去查一个不存在的故障。
     */
    geoReady: geoReady(),
    geoState: geoState(),
  })
})

// ------------------------------------------------------------------- 审计日志
/**
 * 操作日志页的数据源。
 *
 * 动作码 → 中文句式的翻译在 `audit.mjs`（服务端），不在这里也不在前端：
 * detail 的格式只有写入方知道，前端拿到的如果只是字符串，就只能原样展示英文状态码。
 */
const AUDIT_RANGES = [7, 30, 90, 0] // 0 = 全部

api.get('/admin/audit-logs', requireAuth, (req, res) => {
  const resultRaw = String(req.query.result ?? 'all')
  const result = ['all', 'success', 'failed'].includes(resultRaw) ? resultRaw : 'all'
  const rangeRaw = Number.parseInt(req.query.range ?? '7', 10)
  const range = AUDIT_RANGES.includes(rangeRaw) ? rangeRaw : 7
  const actor = String(req.query.actor ?? '').trim()

  const perPage = Math.min(Math.max(Number.parseInt(req.query.perPage ?? '20', 10) || 20, 1), 100)

  const where = []
  const params = []
  if (result !== 'all') {
    where.push('result = ?')
    params.push(result)
  }
  if (range > 0) {
    where.push('created_at >= ?')
    params.push(new Date(Date.now() - range * 86400000).toISOString())
  }
  if (actor) {
    where.push('actor = ?')
    params.push(actor)
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''

  const total = get(`SELECT COUNT(*) AS n FROM audit_logs ${whereSql}`, ...params)?.n ?? 0
  const totalPages = Math.max(Math.ceil(total / perPage), 1)
  // 越界页码收敛到最后一页：从新到旧翻页时，旧链接不该因为清理过日志就报错
  const page = Math.min(Math.max(Number.parseInt(req.query.page ?? '1', 10) || 1, 1), totalPages)

  const rows = all(
    `SELECT id, actor, action, target_type, target_id, detail, result, ip, created_at
     FROM audit_logs ${whereSql}
     ORDER BY id DESC
     LIMIT ? OFFSET ?`,
    ...params,
    perPage,
    (page - 1) * perPage
  )

  res.json({
    items: rows.map((r) => {
      const { text, known } = describeAction(r)
      return {
        id: r.id,
        at: r.created_at,
        atLabel: listTimeLabel(r.created_at),
        actor: r.actor,
        /** 'system' 与真人操作在视觉上应当能区分开 */
        actorKind: r.actor === 'system' ? 'system' : 'user',
        action: r.action,
        actionKnown: known,
        text,
        targetType: r.target_type,
        targetId: r.target_id,
        result: r.result,
        ip: r.ip,
      }
    }),
    counts: resultCounts(),
    actors: actorOptions(),
    range,
    result,
    actor,
    total,
    page,
    perPage,
    totalPages,
    retentionDays: RETENTION_DAYS,
    /** 超出保留期、等着被清理的条数。界面上如实展示，不假装策略已经生效。 */
    expired: expiredCount(),
  })
})

/**
 * 手动清理超出保留期的日志。这个动作本身也记一条账 ——
 * 删日志的动作不记日志，就等于给了自己一支可以擦掉记录的笔。
 */
api.post('/admin/audit-logs/prune', requireAuth, sensitiveLimiter, (req, res) => {
  const days = Number.parseInt(req.query.days ?? String(RETENTION_DAYS), 10)
  const keep = [7, 30, 90, 180, 365].includes(days) ? days : RETENTION_DAYS
  const { removed, cutoff } = pruneAuditLogs(keep)

  if (removed > 0) {
    writeAudit({
      userId: req.user.id,
      actor: req.user.email,
      action: 'audit_prune',
      targetType: 'audit_log',
      detail: `清理 ${removed} 条 · 保留 ${keep} 天（${cutoff.slice(0, 10)} 之前的记录）`,
      req,
    })
  }

  run('PRAGMA optimize')
  res.json({ removed, days: keep, counts: resultCounts(), expired: expiredCount(), total: get('SELECT COUNT(*) AS n FROM audit_logs')?.n ?? 0 })
})

// ------------------------------------------------------------------- 站点设置
/**
 * 运行期事实，供「集成与密钥」分区只读展示。
 * 体积只在请求时算一次 —— 放在启动时记下来会在上传媒体后立刻失真。
 */
function runtimeFacts() {
  const sizeOf = (target) => {
    try {
      const st = statSync(target)
      if (st.isFile()) return st.size
      return 0
    } catch {
      return -1
    }
  }

  const fmt = (bytes) => {
    if (bytes < 0) return '不可读取'
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  }

  const uploadDir = process.env.UPLOAD_DIR ?? resolve(projectRoot, 'data/uploads')
  let uploadBytes = 0
  let uploadFiles = 0
  try {
    const walk = (dir) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name)
        if (entry.isDirectory()) walk(full)
        else {
          uploadFiles += 1
          uploadBytes += sizeOf(full)
        }
      }
    }
    walk(uploadDir)
  } catch {
    /* 目录还不存在 = 还没上传过任何东西，不是错误 */
  }

  // SQLite 的 WAL 与 shm 是同一份库的组成部分，一并计入才不误导
  const dbBytes = ['', '-wal', '-shm'].reduce((sum, suffix) => sum + Math.max(sizeOf(dbPath + suffix), 0), 0)

  const sourceText =
    APP_SECRET_SOURCE === 'env' ? '来自环境变量 APP_SECRET' : `来自 ${APP_SECRET_FILE}`

  return {
    appSecretConfigured: true,
    appSecretSourceText: sourceText,
    dbPath,
    dbSizeLabel: fmt(dbBytes),
    uploadDir,
    uploadSizeLabel: uploadFiles > 0 ? `${uploadFiles} 个文件 · ${fmt(uploadBytes)}` : '空',
    runtime: `Node ${process.version} · ${process.platform}/${process.arch}`,
    startedAt: formatLocal(new Date(Date.now() - process.uptime() * 1000).toISOString()),
    timezone: process.env.TZ ?? 'Asia/Shanghai',
  }
}

api.get('/admin/settings', requireAuth, (_req, res) => {
  const { groups } = readSettings()
  res.json({ groups: [...groups, systemGroup(runtimeFacts())] })
})

/**
 * 保存设置。分区是「一次一屏」的粒度，但接口接受任意子集 ——
 * 只有一个开关变了却要回写整屏字段，容易把并行的另一次修改覆盖回去。
 */
api.patch('/admin/settings', requireAuth, sensitiveLimiter, (req, res) => {
  const outcome = writeSettings(req.body)
  if (!outcome.ok) return res.status(400).json({ error: outcome.error })

  if (outcome.changed.length) {
    writeAudit({
      userId: req.user.id,
      actor: req.user.email,
      action: 'settings_update',
      targetType: 'settings',
      detail: describeSettingsChange(outcome.changed),
      req,
    })
  }

  res.json({
    changed: outcome.changed,
    groups: [...outcome.groups, systemGroup(runtimeFacts())],
  })
})

// ------------------------------------------------------------------- 内容：文章
/** 回收站没有单独的列，就用 status 的第三个取值表示 —— 少一张表，也就少一处状态不同步。 */
const POST_STATUSES = ['published', 'draft', 'trash']

const POST_SORTS = {
  updated: 'updated_at DESC, id DESC',
  created: 'created_at DESC, id DESC',
  views: 'views DESC, id DESC',
}

function asPostListItem(r) {
  return {
    id: r.id,
    slug: r.slug,
    title: r.title,
    category: r.category,
    excerpt: r.excerpt,
    status: r.status,
    views: r.views,
    readingTime: r.reading_time,
    coverImage: r.cover_image,
    publishedAt: r.published_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    updatedLabel: listTimeLabel(r.updated_at),
  }
}

/** 三个页签的计数一次算完：分三次查只是徒增往返，计数本身也没什么成本。 */
function postStatusCounts() {
  const row = get(
    `SELECT COUNT(*) AS total,
            SUM(CASE WHEN status = 'published' THEN 1 ELSE 0 END) AS published,
            SUM(CASE WHEN status = 'draft'     THEN 1 ELSE 0 END) AS draft,
            SUM(CASE WHEN status = 'trash'     THEN 1 ELSE 0 END) AS trash
     FROM posts`
  )
  return {
    all: row?.total ?? 0,
    published: row?.published ?? 0,
    draft: row?.draft ?? 0,
    trash: row?.trash ?? 0,
  }
}

/**
 * 文章的筛选条件 → `WHERE` 片段与参数。
 *
 * 列表接口与「按当前筛选全选」的批量接口共用这一份。它不是为了少写几行才抽出来的：
 * 全选处理的目标集合，必须与列表**当时显示的那一个**相同，否则会出现
 * 「选了 12 篇、只动了 10 篇」这种无从解释的结果。共用一份筛选，等于让这个不变量
 * 由程序结构保证，而不是靠两处代码写得像。
 *
 * 未知状态的归一化也一并在这里做（认不出的归类到 `all`）：一处错两边一起错，
 * 比两边各 subtle 地错一半更容易暴露。
 */
function postScope(query) {
  const statusRaw = String(query?.status ?? 'all')
  const status = ['all', ...POST_STATUSES].includes(statusRaw) ? statusRaw : 'all'
  const category = String(query?.category ?? 'all')

  const where = []
  const params = []
  if (status !== 'all') {
    where.push('status = ?')
    params.push(status)
  }
  if (category !== 'all') {
    where.push('category = ?')
    params.push(category)
  }
  return { whereSql: where.length ? `WHERE ${where.join(' AND ')}` : '', params, status, category }
}

api.get('/admin/posts', requireAuth, (req, res) => {
  const { whereSql, params } = postScope(req.query)
  const sortRaw = String(req.query.sort ?? 'updated')
  const sort = Object.hasOwn(POST_SORTS, sortRaw) ? sortRaw : 'updated'
  const perPage = Math.min(Math.max(Number.parseInt(req.query.perPage ?? '8', 10) || 8, 1), 50)

  const total = get(`SELECT COUNT(*) AS n FROM posts ${whereSql}`, ...params)?.n ?? 0
  const totalPages = Math.max(Math.ceil(total / perPage), 1)
  // 越界页码收敛到最后一页而不是报错：用户删掉最后一篇后旧链接仍该能用
  const page = Math.min(Math.max(Number.parseInt(req.query.page ?? '1', 10) || 1, 1), totalPages)

  const rows = all(
    `SELECT id, slug, title, category, excerpt, status, views, reading_time, cover_image,
            published_at, created_at, updated_at
     FROM posts ${whereSql}
     ORDER BY ${POST_SORTS[sort]}
     LIMIT ? OFFSET ?`,
    ...params,
    perPage,
    (page - 1) * perPage
  )

  res.json({
    items: rows.map(asPostListItem),
    counts: postStatusCounts(),
    page,
    perPage,
    total,
    totalPages,
  })
})

/**
 * 分类清单（不含标签）。
 *
 * 这一屏之外的三个地方都要它：文章列表的分类筛选条、编辑器的分类下拉、
 * 以及「分类与标签」屏自己。所以它读的是 `server/taxonomy.mjs` 里那一份
 * `categoryItems()`，而不是就地拼一遍 —— `postCount` 的口径必须只有一处。
 */
api.get('/admin/categories', requireAuth, (_req, res) => {
  res.json({ items: categoryItems() })
})

// ------------------------------------------------------------- 内容：分类与标签
/**
 * 这一屏要的全部东西：分类、标签、近重复分组与各项计数。
 *
 * 一次取完而不是拆成 `/categories` + `/tags` 两个请求：标签云、合并按钮的可用性、
 * 两个面板的副标题都由同一份数据推导，分两次取只会让它们在刷新瞬间互相矛盾
 * （比如标签删完了，合并按钮还亮着）。
 */
api.get('/admin/taxonomy', requireAuth, (_req, res) => {
  res.json(readTaxonomyAdmin())
})

/** 新建分类。名称上限与近重复判定来自 `shared/taxonomy.mjs`，与界面提示同源。 */
api.post('/admin/categories', requireAuth, (req, res) => {
  const outcome = createCategory(req.body?.name)
  if (outcome.error) {
    writeAudit({
      userId: req.user.id,
      actor: req.user.email,
      action: 'category_create',
      targetType: 'category',
      detail: `被拒 · ${outcome.error}`,
      result: 'failed',
      req,
    })
    return res.status(400).json({ error: outcome.error })
  }

  writeAudit({
    userId: req.user.id,
    actor: req.user.email,
    action: 'category_create',
    targetType: 'category',
    targetId: String(outcome.item.id),
    detail: `${outcome.item.name} · ${outcome.item.slug}`,
    req,
  })
  res.status(201).json({ item: outcome.item, ...taxonomyFacets() })
})

/**
 * 重命名分类。
 *
 * 这是一次**连带写入**：`categories.name` 与所有 `posts.category` 一起改
 * （原因见 `server/taxonomy.mjs`）。审计里如实写出被连带改动的文章数 ——
 * 那正是只看「重命名分类」四个字时看不到的代价。
 */
api.patch('/admin/categories/:id', requireAuth, (req, res) => {
  const id = Number.parseInt(req.params.id, 10)
  if (!Number.isInteger(id)) return res.status(400).json({ error: '分类 ID 不合法' })

  const outcome = renameCategory(id, req.body?.name)
  if (outcome.error) {
    writeAudit({
      userId: req.user.id,
      actor: req.user.email,
      action: 'category_update',
      targetType: 'category',
      targetId: String(id),
      detail: `被拒 · ${outcome.error}`,
      result: 'failed',
      req,
    })
    return res.status(outcome.error === '分类不存在' ? 404 : 400).json({ error: outcome.error })
  }

  if (outcome.changed) {
    writeAudit({
      userId: req.user.id,
      actor: req.user.email,
      action: 'category_update',
      targetType: 'category',
      targetId: String(id),
      detail: `名称 · ${outcome.item.name}${outcome.movedPosts ? ` · 连带更新 ${outcome.movedPosts} 篇文章` : ''}`,
      req,
    })
  }
  res.json({ item: outcome.item, changed: outcome.changed, movedPosts: outcome.movedPosts ?? 0, ...taxonomyFacets() })
})

/**
 * 拖拽排序：整份顺序一次提交，下标即顺序。约束与项目排序相同，见 `reorderCategories`。
 * 顺序决定前台「博客」页筛选条的排列，所以这是能看见结果的一次改动。
 */
api.post('/admin/categories/reorder', requireAuth, (req, res) => {
  const outcome = reorderCategories(req.body?.ids)
  if (outcome.error) return res.status(400).json({ error: outcome.error })

  writeAudit({
    userId: req.user.id,
    actor: req.user.email,
    action: 'category_reorder',
    targetType: 'category',
    detail: `${outcome.reordered} 个分类`,
    req,
  })
  res.json({ reordered: outcome.reordered, items: outcome.items })
})

/**
 * 删除分类。挂着文章时默认 409 并带回清单，`?force=1` 才解绑后删除 ——
 * 与媒体库同一条规矩：**先看清代价，再决定删不删**。
 */
api.delete('/admin/categories/:id', requireAuth, (req, res) => {
  const id = Number.parseInt(req.params.id, 10)
  if (!Number.isInteger(id)) return res.status(400).json({ error: '分类 ID 不合法' })

  const forced = String(req.query.force ?? '') === '1'
  const outcome = deleteCategory(id, forced)

  if (outcome.error) {
    return res.status(outcome.error === '分类不存在' ? 404 : 400).json({ error: outcome.error })
  }
  if (outcome.blocked) {
    writeAudit({
      userId: req.user.id,
      actor: req.user.email,
      action: 'category_delete',
      targetType: 'category',
      targetId: String(id),
      detail: `被拒 · 《${outcome.name}》下还有 ${outcome.posts.length} 篇文章`,
      result: 'failed',
      req,
    })
    return res.status(409).json({
      error: `《${outcome.name}》下还有 ${outcome.posts.length} 篇文章，删除后它们会变成未分类`,
      posts: outcome.posts,
    })
  }

  writeAudit({
    userId: req.user.id,
    actor: req.user.email,
    action: 'category_delete',
    targetType: 'category',
    targetId: String(id),
    detail: `《${outcome.item.name}》${outcome.unbound ? ` · 解绑 ${outcome.unbound} 篇文章` : ''}`,
    req,
  })
  res.json({ deleted: true, id, unbound: outcome.unbound, ...taxonomyFacets() })
})

/** 新建标签。只有名字一个字段 —— `tags` 表也就只有这一列。 */
api.post('/admin/tags', requireAuth, (req, res) => {
  const outcome = createTag(req.body?.name)
  if (outcome.error) {
    writeAudit({
      userId: req.user.id,
      actor: req.user.email,
      action: 'tag_create',
      targetType: 'tag',
      detail: `被拒 · ${outcome.error}`,
      result: 'failed',
      req,
    })
    return res.status(400).json({ error: outcome.error })
  }

  writeAudit({
    userId: req.user.id,
    actor: req.user.email,
    action: 'tag_create',
    targetType: 'tag',
    targetId: String(outcome.item.id),
    detail: outcome.item.name,
    req,
  })
  res.status(201).json({ item: outcome.item, ...taxonomyFacets() })
})

api.patch('/admin/tags/:id', requireAuth, (req, res) => {
  const id = Number.parseInt(req.params.id, 10)
  if (!Number.isInteger(id)) return res.status(400).json({ error: '标签 ID 不合法' })

  const outcome = renameTag(id, req.body?.name)
  if (outcome.error) {
    return res.status(outcome.error === '标签不存在' ? 404 : 400).json({ error: outcome.error })
  }
  /* 改名是「标签的定义变了」，与新建/删除都不是一回事，所以单独一个码。
     挂到 tag_delete 上会让人以为删过东西（日志页只按动作码区分）。 */
  if (outcome.changed) {
    writeAudit({
      userId: req.user.id,
      actor: req.user.email,
      action: 'tag_rename',
      targetType: 'tag',
      targetId: String(id),
      detail: outcome.item.name,
      req,
    })
  }
  res.json({ item: outcome.item, changed: outcome.changed, ...taxonomyFacets() })
})

/** 删除标签：只解除关联，文章不动（`post_tags` 上是级联）。 */
api.delete('/admin/tags/:id', requireAuth, (req, res) => {
  const id = Number.parseInt(req.params.id, 10)
  if (!Number.isInteger(id)) return res.status(400).json({ error: '标签 ID 不合法' })

  const outcome = deleteTag(id)
  if (outcome.error) {
    return res.status(outcome.error === '标签不存在' ? 404 : 400).json({ error: outcome.error })
  }

  writeAudit({
    userId: req.user.id,
    actor: req.user.email,
    action: 'tag_delete',
    targetType: 'tag',
    targetId: String(id),
    detail: `${outcome.item.name}${outcome.unbound ? ` · 解除 ${outcome.unbound} 篇关联` : ''}`,
    req,
  })
  res.json({ deleted: true, id, unbound: outcome.unbound, ...taxonomyFacets() })
})

/** 清理 0 篇的标签。没有可清理的如实返回 0，审计也只在真删了东西时写。 */
api.post('/admin/tags/prune-unused', requireAuth, (req, res) => {
  const outcome = deleteUnusedTags()
  if (outcome.removed) {
    writeAudit({
      userId: req.user.id,
      actor: req.user.email,
      action: 'tag_prune',
      targetType: 'tag',
      detail: `${outcome.removed} 个 · ${outcome.names.slice(0, 6).join('、')}${outcome.names.length > 6 ? ' 等' : ''}`,
      req,
    })
  }
  res.json({ removed: outcome.removed, names: outcome.names, ...taxonomyFacets() })
})

/**
 * 合并近重复标签。组与保留者由服务端现算，不接受请求参数 —— 这是会删数据的操作。
 * 没有近重复时返回 0，且不写审计（什么都没发生）。
 */
api.post('/admin/tags/merge', requireAuth, (req, res) => {
  const outcome = mergeDuplicateTags()
  if (outcome.merged) {
    writeAudit({
      userId: req.user.id,
      actor: req.user.email,
      action: 'tag_merge',
      targetType: 'tag',
      detail: `${outcome.groups.map((g) => g.text).join('；')}`,
      req,
    })
  }
  res.json({ ...outcome, ...taxonomyFacets() })
})

// ------------------------------------------------- 内容：文章（编辑器：单篇读写）
/** 永久链接只允许小写字母、数字与连字符：带汉字或空格的 URL 复制出去会变成一串转义码。 */
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/** 与画布上「68 / 160」那个计数器同一个上限 —— 超了搜索引擎会截断，不如当场拦住。 */
const SEO_MAX = 160

/**
 * 编辑器可写的字段白名单。
 *
 * 白名单之外多传的键一律丢弃，而不是原样落库：接口边界与界面对齐，
 * 免得日后冒出一个「谁也不知道是谁写进去的」字段。注意 `status` **不在**这里 ——
 * 状态流转是列表页的动作，走独立分支，两边的审计动作码也不同。
 */
const CONTENT_KEYS = ['title', 'slug', 'excerpt', 'category', 'body', 'tags', 'seoDescription', 'coverImage']

/** 审计文案里用的字段中文名。动作目录里 `post_save` 渲染成「保存文章 · <detail>」。 */
const FIELD_LABELS = {
  title: '标题',
  slug: '永久链接',
  excerpt: '摘要',
  category: '分类',
  body: '正文',
  tags: '标签',
  seoDescription: 'SEO 描述',
  coverImage: '封面图',
}

/** 校验并归一化编辑器提交的字段。返回 `{ error }` 或 `{ values }`，**不落库**。 */
function readPostPayload(body) {
  const out = {}
  const str = (v) => String(v ?? '').trim()

  if ('title' in body) {
    const title = str(body.title)
    if (!title) return { error: '标题不能为空' }
    if (title.length > 120) return { error: `标题不能超过 120 字（当前 ${title.length}）` }
    out.title = title
  }

  if ('slug' in body) {
    const slug = str(body.slug)
    if (!SLUG_RE.test(slug)) return { error: '永久链接只能用小写字母、数字与连字符，例如 self-hosted-ci-traps' }
    out.slug = slug
  }

  if ('excerpt' in body) out.excerpt = str(body.excerpt).slice(0, 300)
  if ('body' in body) out.body = String(body.body ?? '')

  if ('category' in body) {
    const category = str(body.category)
    /*
     * 分类必须是**已存在**的一项。允许自由文本的话，打错一个字就会在
     * `posts.category` 里多出一个只出现一次的分类 —— 而前台列表的筛选标签
     * 是从 `categories` 表生成的，那篇文章会掉进一个筛选不到的缝里。
     */
    if (category && !get('SELECT id FROM categories WHERE name = ?', category)) {
      return { error: `分类「${category}」不存在，请先在「分类与标签」中创建` }
    }
    out.category = category
  }

  if ('seoDescription' in body) {
    const seo = str(body.seoDescription)
    if (seo.length > SEO_MAX) return { error: `SEO 描述不能超过 ${SEO_MAX} 字（当前 ${seo.length}）` }
    // 留 NULL 而不是空串：仪表盘的「待补充 SEO 摘要」按 IS NULL OR = '' 计数
    out.seoDescription = seo || null
  }

  if ('coverImage' in body) out.coverImage = str(body.coverImage) || null

  if ('tags' in body) {
    if (!Array.isArray(body.tags)) return { error: '标签需要是字符串数组' }
    if (body.tags.length > 12) return { error: '标签最多 12 个' }
    out.tags = body.tags.map((t) => str(t)).filter(Boolean)
  }

  if (!Object.keys(out).length) return { error: '没有可保存的字段' }
  return { values: out }
}

/**
 * 重写一篇的标签关联，缺的标签顺手建出来。
 *
 * 先删后插而不是做差集：标签数量是个位数，一次全量替换比维护差集简单得多，
 * 也不会留下「已经取消勾选但关联还在」的残影。
 */
function linkTags(postId, names) {
  const wanted = []
  for (const raw of names ?? []) {
    const name = String(raw ?? '').trim()
    if (!name) continue
    const slug = slugify(name)
    if (!wanted.some((t) => t.slug === slug)) wanted.push({ name, slug })
  }

  run('DELETE FROM post_tags WHERE post_id = ?', postId)
  for (const tag of wanted) {
    let row = get('SELECT id FROM tags WHERE slug = ?', tag.slug)
    if (!row) {
      const res = run('INSERT INTO tags (name, slug, created_at) VALUES (?, ?, ?)', tag.name, tag.slug, nowIso())
      row = { id: Number(res.lastInsertRowid) }
    }
    run('INSERT OR IGNORE INTO post_tags (post_id, tag_id) VALUES (?, ?)', postId, row.id)
  }
  return wanted.map((t) => t.name)
}

function readPostTags(postId) {
  return all(
    'SELECT t.name FROM tags t JOIN post_tags pt ON pt.tag_id = t.id WHERE pt.post_id = ? ORDER BY t.name',
    postId
  ).map((r) => r.name)
}

/**
 * 标题 → 永久链接。中文标题经 slugify 之后仍是中文，不能直接做 URL，
 * 这时退回 `post-<时间戳>` 由作者自己改 —— **不猜拼音**，
 * 猜错的链接比难看的链接更难纠正（发出去的链接改不动）。
 */
function autoSlug(title, prefix = 'post') {
  const base = slugify(title)
  return SLUG_RE.test(base) ? base : `${prefix}-${Date.now().toString(36)}`
}

/** 编辑器要的完整一篇：正文、标签、SEO 描述都在里面（列表项那条不带这些）。 */
function asPostDetail(row) {
  return {
    ...asPostListItem(row),
    body: row.body ?? '',
    seoDescription: row.seo_description ?? '',
    tags: readPostTags(row.id),
    /**
     * 发布时间拼成 'YYYY-MM-DD HH:mm'。
     * 口径与列表页的 `updatedLabel` 相同 —— 一律在服务端拼好，前端不再二次格式化，
     * 否则同一个时间会在两处显示成两种样子（历史上踩过一次）。
     */
    publishedAtLabel: formatLocal(row.published_at),
  }
}

api.get('/admin/posts/:id', requireAuth, (req, res) => {
  const id = Number.parseInt(req.params.id, 10)
  if (!Number.isInteger(id)) return res.status(400).json({ error: '文章 ID 不合法' })

  const row = get('SELECT * FROM posts WHERE id = ?', id)
  if (!row) return res.status(404).json({ error: '文章不存在' })

  res.json({
    post: asPostDetail(row),
    categories: all('SELECT name FROM categories ORDER BY sort_order, id').map((r) => r.name),
    allTags: all('SELECT name FROM tags ORDER BY name').map((r) => r.name),
    author: getSetting('author', ''),
  })
})

/** 新建一篇。落到草稿状态：新建即发布是最容易误发的一步。 */
api.post('/admin/posts', requireAuth, (req, res) => {
  const body = req.body ?? {}
  const parsed = readPostPayload(body)
  if (parsed.error) return res.status(400).json({ error: parsed.error })
  const v = parsed.values
  if (!v.title) return res.status(400).json({ error: '标题不能为空' })

  const slug = uniqueSlug(v.slug ?? autoSlug(v.title))
  const now = nowIso()

  let id = 0
  tx(() => {
    const result = run(
      `INSERT INTO posts (slug, title, category, excerpt, body, status, reading_time, cover_image,
                          seo_description, published_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'draft', ?, ?, ?, NULL, ?, ?)`,
      slug,
      v.title,
      v.category ?? '',
      v.excerpt ?? '',
      v.body ?? '',
      readingLabel(v.body ?? ''),
      v.coverImage ?? null,
      v.seoDescription ?? null,
      now,
      now
    )
    id = Number(result.lastInsertRowid)
    if (v.tags) linkTags(id, v.tags)
  })

  writeAudit({
    userId: req.user.id,
    actor: req.user.email,
    action: 'post_save',
    targetType: 'post',
    targetId: String(id),
    detail: `新建《${v.title}》`,
    req,
  })

  res.status(201).json({
    post: asPostDetail(get('SELECT * FROM posts WHERE id = ?', id)),
    counts: postStatusCounts(),
  })
})

/**
 * 改一篇。
 *
 * 两个分支互不干扰，也各有各的审计动作码：
 *   - `status`      → 列表页的页签动作（发布 / 转草稿 / 回收站），`post_status`
 *   - 内容字段      → 编辑器那一屏的保存，`post_save`
 *
 * **先校验完再落库**：校验失败时不能留下「状态改了、正文没保存」的半截结果。
 */
api.patch('/admin/posts/:id', requireAuth, (req, res) => {
  const id = Number.parseInt(req.params.id, 10)
  if (!Number.isInteger(id)) return res.status(400).json({ error: '文章 ID 不合法' })

  const row = get('SELECT * FROM posts WHERE id = ?', id)
  if (!row) return res.status(404).json({ error: '文章不存在' })

  const body = req.body ?? {}
  const now = nowIso()
  const changed = []

  // ---- 校验阶段（纯计算，不写库）
  let content = null
  if (CONTENT_KEYS.some((k) => k in body)) {
    const parsed = readPostPayload(body)
    if (parsed.error) return res.status(400).json({ error: parsed.error })
    content = parsed.values
    if (content.slug && content.slug !== row.slug && get('SELECT id FROM posts WHERE slug = ?', content.slug)) {
      return res.status(409).json({ error: `永久链接「${content.slug}」已被占用` })
    }
  }

  // ---- 1) 状态流转
  if ('status' in body) {
    const status = String(body.status)
    if (!POST_STATUSES.includes(status)) {
      return res.status(400).json({ error: '状态只支持 published / draft / trash' })
    }
    if (status !== row.status) {
      // 首次发布时记下发布时间；转回草稿不清空，否则再次发布会把「发布于」抹成今天
      const publishedAt = status === 'published' ? (row.published_at ?? now) : row.published_at
      run('UPDATE posts SET status = ?, published_at = ?, updated_at = ? WHERE id = ?', status, publishedAt, now, id)
      changed.push(`状态 ${row.status} → ${status}`)
      writeAudit({
        userId: req.user.id,
        actor: req.user.email,
        action: 'post_status',
        targetType: 'post',
        targetId: String(id),
        detail: `${row.title}：${row.status} → ${status}`,
        req,
      })
    }
  }

  // ---- 2) 正文与元信息
  if (content) {
    const sets = []
    const params = []
    const push = (col, value) => {
      sets.push(`${col} = ?`)
      params.push(value)
    }

    if (content.title !== undefined) push('title', content.title)
    if (content.slug !== undefined) push('slug', content.slug)
    if (content.excerpt !== undefined) push('excerpt', content.excerpt)
    if (content.category !== undefined) push('category', content.category)
    if (content.seoDescription !== undefined) push('seo_description', content.seoDescription)
    if (content.coverImage !== undefined) push('cover_image', content.coverImage)
    if (content.body !== undefined) {
      push('body', content.body)
      // 阅读时长是派生值，写入正文时刷新缓存列；前台文章页不读这一列，永远现算
      push('reading_time', readingLabel(content.body))
    }
    push('updated_at', now)

    // 正文与标签分属两张表，必须同进同出 —— 否则会出现「正文更新了、标签还是旧的」
    tx(() => {
      run(`UPDATE posts SET ${sets.join(', ')} WHERE id = ?`, ...params, id)
      if (content.tags !== undefined) linkTags(id, content.tags)
    })

    const labels = Object.keys(content).map((k) => FIELD_LABELS[k] ?? k)
    changed.push(...labels)
    writeAudit({
      userId: req.user.id,
      actor: req.user.email,
      action: 'post_save',
      targetType: 'post',
      targetId: String(id),
      detail: `《${content.title ?? row.title}》${labels.join('、')}`,
      req,
    })
  }

  if (!changed.length) {
    return res.json({ post: asPostDetail(row), changed: false, fields: [], counts: postStatusCounts() })
  }

  res.json({
    post: asPostDetail(get('SELECT * FROM posts WHERE id = ?', id)),
    changed: true,
    fields: changed,
    counts: postStatusCounts(),
  })
})

/** 彻底删除只对回收站里的文章开放。想删先移入回收站，多一道手滑保护。 */
api.delete('/admin/posts/:id', requireAuth, (req, res) => {
  const id = Number.parseInt(req.params.id, 10)
  if (!Number.isInteger(id)) return res.status(400).json({ error: '文章 ID 不合法' })

  const row = get('SELECT id, title, status FROM posts WHERE id = ?', id)
  if (!row) return res.status(404).json({ error: '文章不存在' })
  if (row.status !== 'trash') {
    return res.status(409).json({ error: '只有回收站里的文章可以彻底删除，请先移入回收站' })
  }

  run('DELETE FROM posts WHERE id = ?', id)
  writeAudit({
    userId: req.user.id,
    actor: req.user.email,
    action: 'post_delete',
    targetType: 'post',
    targetId: String(id),
    detail: `彻底删除：${row.title}`,
    req,
  })
  res.json({ deleted: true, id, counts: postStatusCounts() })
})

// --------------------------------------------------------- 批量操作（三屏共用）

/*
 * 批量操作有三个屏要用（文章 / 项目 / 媒体库），所以契约只有一套：`{ ids, action }`。
 *
 * 为什么三屏共用一个形状，而不是各写各的：批量动作里有「不可逆」的那几个（彻底删除、
 * 删除媒体），它们的准入判定、跳过后的回执、审计里那句话，三处只要有一处长得不一样，
 * 使用者就得重新学一遍「这一屏选完之后会发生什么」。形状统一之后前端也只需要一个
 * helper，不会出现「文章屏的确认弹层说了跳过，项目屏悄悄地全删了」。
 *
 * `affected` 与 `skipped` 的语义是**逐条**的，不做「全有或全无」：一次选中 20 条里
 * 混进 1 条不符合条件的，没有理由把那 19 条也一起卡住。代价通过 `skipped`
 * 原样回带（每条都带理由），前端在动手**之前**就用同一份数据摆出了清单 ——
 * 所以这不是事后告知，而是同一份账的两次呈现。
 */
const BULK_MAX = 200

/**
 * 「按筛选全选」的上限，单独一道，比 `BULK_MAX` 宽。
 *
 * 它不是 `BULK_MAX` 的替代品：那个限制的是「一次请求携带多少 id」，
 * 这个限制的是「后台一个按钮能带动多少条数据」。前者是请求体体积问题，
 * 后者是误操作半径问题 —— 全选最容易发生在人不在意的那一刻，所以它要有自己的闸。
 */
const BULK_FILTER_MAX = 500

/**
 * 读出一次批量请求的三个部分：动作、选中范围、以及数量快照。
 *
 * 选中范围有两种，**互斥**：
 *   `ids`    —— 显式勾选（当前页勾几个），沿用至今的用法；
 *   `filter` —— 按当前筛选全选（跨页），服务端用与各列表 route 同一个筛选函数求集合。
 *
 * 为什么 filter 模式不让前端先把全部 id 拉下来再传回来 —— 三条理由，任一条都够：
 *   1. `BULK_MAX` 会在几百条时先把它拦下来，而「全选」本就是为数量多才存在的场景；
 *   2. 拉 id 与传回之间若有别处写入，前端手上那份列表已经过期，执行时会命中一堆
 *      它没看到的东西；
 *   3. 「列表显示什么」与「批量处理什么」若各写一份筛选规则，早晚会长歪，
 *      届时「全选了 12 篇、只动了 10 篇」将无从解释。
 */
function readBulkPayload(body, allowed, resolveFilter) {
  const src = body && typeof body === 'object' ? body : {}
  const action = String(src.action ?? '')
  if (!allowed.includes(action)) {
    return { error: `这个接口的动作只支持 ${allowed.join(' / ')}` }
  }

  const explicit = Array.isArray(src.ids) ? src.ids : null
  const byFilter = src.filter && typeof src.filter === 'object' ? src.filter : null

  // 同时给了没法判断到底要处理哪一批 —— 这个歧义不靠猜：两者都说得通，
  // 而「批量 × 猜错了范围」是这里最贵的组合，直接要求调用方说清楚。
  if (explicit && byFilter) return { error: 'ids 与 filter 只能给一个' }

  if (explicit) {
    if (!explicit.length) return { error: '没有选中任何条目' }
    if (explicit.length > BULK_MAX) {
      return { error: `一次最多处理 ${BULK_MAX} 项（收到 ${explicit.length} 项）` }
    }
    const ids = explicit.map((v) => Number.parseInt(String(v), 10))
    if (ids.some((n) => !Number.isInteger(n))) return { error: 'ID 列表里有非法值' }
    /*
     * `ids` 去重而不报错：这是「我选了这些」而不是「请按这个顺序处理」，
     * 重复项没有语义，报错只会让人对着一个看不出差别的列表找哪里重复了。
     * （`/admin/projects/reorder` 那边相反，那里重复项真的会让顺序错位。）
     */
    return { action, scope: 'ids', ids: [...new Set(ids)] }
  }

  if (byFilter) {
    const resolved = resolveFilter(byFilter)
    if (resolved.error) return { error: resolved.error }

    /*
     * `exclude`：全选之后又手动取消了某几条。
     * 「选中除了这三条以外的一切」没有别的表达方式 —— 只靠 ids 是做不到的
     * （ids 是那些没勾的，得先取全集才能减掉，而这正是 filter 模式该干的事）。
     */
    const exclude = new Set(
      (Array.isArray(src.exclude) ? src.exclude : [])
        .map((v) => Number.parseInt(String(v), 10))
        .filter((n) => Number.isInteger(n))
    )
    const ids = resolved.ids.filter((id) => !exclude.has(id))

    /*
     * `expected` 是一次**数量快照**：确认弹层上写着「将处理 12 篇」，用户按下去了。
     *
     * 但从看到那个数字到请求抵达之间可能已经不是 12 篇了 —— 另一台设备刚发了
     * 一篇、清理定时器刚删了几条。不一致时**不动手**，返回 409 让他重新看一遍。
     * 对「彻底删除」这种不可逆的动作，多一次确认的成本远小于删错的成本；
     * 若静默按新集合执行，等于把一次误操作的半径交给时机决定。
     */
    if (Number.isInteger(src.expected) && src.expected !== ids.length) {
      return {
        conflict: `列表已经变了：你看到的是 ${src.expected} 项，现在是 ${ids.length} 项，请重新确认`,
        expected: src.expected,
        actual: ids.length,
      }
    }

    if (!ids.length) return { error: '当前筛选下没有可处理的条目' }
    if (ids.length > BULK_FILTER_MAX) {
      return { error: `一次最多处理 ${BULK_FILTER_MAX} 项，请换个筛选条件分批来做（当前 ${ids.length} 项）` }
    }
    return { action, scope: 'filter', ids, total: ids.length }
  }

  return { error: '没有选中任何条目' }
}

/** 审计与回执里的名字清单：最多列 3 个，其余折成「等 N 个」。一行日志不该被 200 个标题撑爆。 */
function nameSummary(names, format = (n) => `《${n}》`) {
  const shown = names.slice(0, 3).map(format).join(' ')
  return names.length > 3 ? `${shown} 等 ${names.length} 个` : shown
}

/** 日志里的动词。动作码只有一个（`post_bulk`），具体做了什么由这里区分。 */
const POST_BULK_LABELS = {
  publish: '发布',
  unpublish: '转为草稿',
  trash: '移入回收站',
  restore: '移出回收站',
  delete: '彻底删除',
}

/**
 * 批量流转文章状态 / 批量彻底删除。
 *
 * 五个动作的准入与单条**完全同源**，同源的方式是逐条套用单条那边的同一组条件，
 * 而不是近似的另一套规则：
 *   - 状态流转的目标 state 是三选一，所以「已经是它」就算跳过 —— 单条 `PATCH`
 *     正是 `status !== row.status` 时才写（`restore` 与 `unpublish` 的目标都是
 *     `draft`，所以它们的跳过理由不同：一个看「在不在回收站」，一个看「是不是草稿」）；
 *   - 彻底删除只对回收站开放，与 `DELETE /admin/posts/:id` 说的是同一句话。
 *
 * `filter` 范围下先一条不多地按筛选取 id（见 `postScope`），再走同一套逐条判定 ——
 * 「全选」只是扩大候选集，不降低任何一条的准入标准。
 */
api.post('/admin/posts/bulk', requireAuth, (req, res) => {
  const parsed = readBulkPayload(req.body, Object.keys(POST_BULK_LABELS), (filter) => {
    const { whereSql, params } = postScope(filter)
    return { ids: all(`SELECT id FROM posts ${whereSql}`, ...params).map((r) => r.id) }
  })
  if (parsed.error) return res.status(400).json({ error: parsed.error })
  if (parsed.conflict) {
    return res.status(409).json({ error: parsed.conflict, expected: parsed.expected, actual: parsed.actual })
  }
  const { action, ids, scope, total } = parsed

  const hit = []
  const skipped = []
  for (const id of ids) {
    const row = get('SELECT id, title, status, published_at FROM posts WHERE id = ?', id)
    if (!row) {
      skipped.push({ id, label: `#${id}`, reason: '文章不存在' })
      continue
    }
    let reason = null
    if (action === 'publish') reason = row.status === 'published' ? '已经是已发布' : null
    else if (action === 'unpublish') reason = row.status === 'draft' ? '已经是草稿' : null
    else if (action === 'trash') reason = row.status === 'trash' ? '已在回收站' : null
    else if (action === 'restore') reason = row.status !== 'trash' ? '不在回收站里' : null
    else if (action === 'delete') reason = row.status !== 'trash' ? '不在回收站，请先移入回收站' : null

    if (reason) skipped.push({ id, label: `《${row.title}》`, reason })
    else hit.push(row)
  }

  if (hit.length) {
    const now = nowIso()
    tx(() => {
      for (const row of hit) {
        if (action === 'delete') {
          run('DELETE FROM posts WHERE id = ?', row.id)
          continue
        }
        const target = action === 'publish' ? 'published' : action === 'trash' ? 'trash' : 'draft'
        // 首次发布记下发布时间，转回草稿不清空 —— 与单条 PATCH 完全相同的口径
        const publishedAt = target === 'published' ? (row.published_at ?? now) : row.published_at
        run('UPDATE posts SET status = ?, published_at = ?, updated_at = ? WHERE id = ?', target, publishedAt, now, row.id)
      }
    })
    writeAudit({
      userId: req.user.id,
      actor: req.user.email,
      action: 'post_bulk',
      targetType: 'post',
      detail: `${POST_BULK_LABELS[action]} ${hit.length} 篇${
        skipped.length ? `（跳过 ${skipped.length} 篇）` : ''
      }${scope === 'filter' ? ' · 按当前筛选全选' : ''}：${nameSummary(hit.map((r) => r.title))}`,
      req,
    })
  }

  res.json({ action, scope, affected: hit.length, skipped, total: total ?? null, counts: postStatusCounts() })
})

// --------------------------------------------------- 内容：项目（卡片墙：增删改与排序）

/** 项目只有「在架上 / 下架」两态。它不像文章那样有回收站页签，所以不引入 trash。 */
const PROJECT_STATUSES = ['published', 'draft']

/** 语言名会出现在筛选条的一行里，太长会把整条推歪。 */
const LANGUAGE_MAX = 40

function asProjectItem(r) {
  return {
    id: r.id,
    slug: r.slug,
    title: r.title,
    description: r.description,
    tags: r.tags,
    language: r.language,
    repoUrl: r.repo_url ?? '',
    featured: Boolean(r.featured),
    status: r.status,
    sortOrder: r.sort_order,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    updatedLabel: listTimeLabel(r.updated_at),
  }
}

/**
 * 副标题上「8 个项目 · 2 个精选」两个数，以及语言筛选条的计数。
 *
 * 三处都从同一份 `projects` 表现算，所以筛选状态下副标题的数字不会跟着变小 ——
 * 它说的是「一共多少」，不是「筛出来多少」。
 *
 * 这里曾经还有第三个「累计 N stars」：那个数来自手填的示意值，没有数据源，
 * 写出来只是把编的数字摆在管理界面上，所以随 stars / forks 一起去掉了。
 */
function projectFacets() {
  const totals = get(
    `SELECT COUNT(*) AS total,
            SUM(CASE WHEN featured = 1 THEN 1 ELSE 0 END) AS featured
     FROM projects`
  )
  const languages = all(
    `SELECT language, COUNT(*) AS n FROM projects
     WHERE language <> '' GROUP BY language ORDER BY n DESC, language`
  ).map((r) => ({ name: r.language, count: r.n }))

  return {
    counts: {
      all: totals?.total ?? 0,
      featured: totals?.featured ?? 0,
    },
    languages,
  }
}

/** 排序口径是闭集，不来自请求原文 —— 拼进 SQL 的是这里选出来的常量。 */
const PROJECT_SORTS = {
  order: 'sort_order, id',
  updated: 'updated_at DESC, id DESC',
}

/**
 * 项目的筛选条件。与 `postScope` 同义、同用途：列表 route 与批量 route 共用一份，
 * 保证「屏幕上显示几条」与「全选会处理几条」永远是同一个集合。
 *
 * 项目目前只有一个维度（语言），抽出来看起来有点过度 —— 但正因为只有一个，
 * 以后加第二个时最容易就地顺手另一个写法，那时它就不只是一行了。
 */
function projectScope(query) {
  return { language: String(query?.language ?? '').trim() }
}

/** 筛选 → SQL 片段。不给语言就是不筛选，不去拼 `WHERE 1=1` 那样的占位条件。 */
function projectSql(scope) {
  return scope.language
    ? { whereSql: 'WHERE language = ?', params: [scope.language] }
    : { whereSql: '', params: [] }
}

api.get('/admin/projects', requireAuth, (req, res) => {
  const scope = projectScope(req.query)
  const { whereSql, params } = projectSql(scope)
  const sort = String(req.query.sort ?? 'order')
  const orderBy = PROJECT_SORTS[sort] ?? PROJECT_SORTS.order

  const rows = all(`SELECT * FROM projects ${whereSql} ORDER BY ${orderBy}`, ...params)

  res.json({ items: rows.map(asProjectItem), sort, language: scope.language, ...projectFacets() })
})

/** 可写字段 → 列名。落库走这张表，请求里多传的键一律丢弃。 */
const PROJECT_COLUMNS = {
  title: 'title',
  slug: 'slug',
  description: 'description',
  tags: 'tags',
  language: 'language',
  repoUrl: 'repo_url',
  featured: 'featured',
  status: 'status',
}

/** 审计文案里的字段中文名。动作目录里 `project_update` 渲染成「更新项目 · <detail>」。 */
const PROJECT_FIELD_LABELS = {
  title: '名称',
  slug: '永久链接',
  description: '简介',
  tags: '技术标签',
  language: '语言',
  repoUrl: '仓库地址',
  featured: '精选',
  status: '状态',
}

/** 校验并归一化项目载荷。返回 `{ error }` 或 `{ values }`，**不落库**。 */
function readProjectPayload(body) {
  const out = {}
  const str = (v) => String(v ?? '').trim()

  if ('title' in body) {
    const title = str(body.title)
    if (!title) return { error: '项目名称不能为空' }
    if (title.length > 120) return { error: `项目名称不能超过 120 字（当前 ${title.length}）` }
    out.title = title
  }

  if ('slug' in body) {
    const slug = str(body.slug)
    if (!SLUG_RE.test(slug)) return { error: '永久链接只能用小写字母、数字与连字符，例如 a4-print' }
    out.slug = slug
  }

  if ('description' in body) out.description = str(body.description).slice(0, 400)
  if ('tags' in body) out.tags = str(body.tags).slice(0, 160)

  if ('language' in body) {
    const language = str(body.language)
    if (language.length > LANGUAGE_MAX) return { error: `语言名不能超过 ${LANGUAGE_MAX} 字` }
    out.language = language
  }

  if ('repoUrl' in body) {
    const url = str(body.repoUrl)
    /*
     * 仓库地址是要被点开的链接。只放行 http(s)：留个 `javascript:` 的口子，
     * 就等于让「填一个项目」变成「在卡片上挂一段脚本」。
     */
    if (url && !/^https?:\/\//i.test(url)) return { error: '仓库地址需要以 http:// 或 https:// 开头' }
    out.repoUrl = url || null
  }

  if ('featured' in body) out.featured = body.featured ? 1 : 0

  if ('status' in body) {
    const status = str(body.status)
    if (!PROJECT_STATUSES.includes(status)) return { error: '状态只支持 published / draft' }
    out.status = status
  }

  if (!Object.keys(out).length) return { error: '没有可保存的字段' }
  return { values: out }
}

/** 新建一个项目。默认不进精选：首页只有 3 个位置，进精选应当是一次明确的选择。 */
api.post('/admin/projects', requireAuth, (req, res) => {
  const parsed = readProjectPayload(req.body ?? {})
  if (parsed.error) return res.status(400).json({ error: parsed.error })
  const v = parsed.values
  if (!v.title) return res.status(400).json({ error: '项目名称不能为空' })

  const slug = uniqueSlug(v.slug ?? autoSlug(v.title, 'project'), null, 'projects')
  const now = nowIso()
  // 排到末尾而不是插到最前：拖拽排序是明确动作，新建顺手改顺序会让人回头找不到它
  const tail = get('SELECT COALESCE(MAX(sort_order), -1) AS n FROM projects')?.n ?? -1

  const result = run(
    `INSERT INTO projects (slug, title, description, tags, language, repo_url,
                           featured, status, sort_order, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    slug,
    v.title,
    v.description ?? '',
    v.tags ?? '',
    v.language ?? '',
    v.repoUrl ?? null,
    v.featured ?? 0,
    v.status ?? 'published',
    tail + 1,
    now,
    now
  )
  const id = Number(result.lastInsertRowid)

  writeAudit({
    userId: req.user.id,
    actor: req.user.email,
    action: 'project_create',
    targetType: 'project',
    targetId: String(id),
    detail: `《${v.title}》`,
    req,
  })

  res.status(201).json({
    project: asProjectItem(get('SELECT * FROM projects WHERE id = ?', id)),
    fields: Object.keys(v).map((k) => PROJECT_FIELD_LABELS[k] ?? k),
    ...projectFacets(),
  })
})

api.patch('/admin/projects/:id', requireAuth, (req, res) => {
  const id = Number.parseInt(req.params.id, 10)
  if (!Number.isInteger(id)) return res.status(400).json({ error: '项目 ID 不合法' })

  const row = get('SELECT * FROM projects WHERE id = ?', id)
  if (!row) return res.status(404).json({ error: '项目不存在' })

  const parsed = readProjectPayload(req.body ?? {})
  if (parsed.error) return res.status(400).json({ error: parsed.error })
  const v = parsed.values

  if (v.slug && v.slug !== row.slug && get('SELECT id FROM projects WHERE slug = ?', v.slug)) {
    return res.status(409).json({ error: `永久链接「${v.slug}」已被占用` })
  }

  const sets = []
  const params = []
  for (const [key, column] of Object.entries(PROJECT_COLUMNS)) {
    if (v[key] === undefined) continue
    sets.push(`${column} = ?`)
    params.push(v[key])
  }
  sets.push('updated_at = ?')
  params.push(nowIso())
  run(`UPDATE projects SET ${sets.join(', ')} WHERE id = ?`, ...params, id)

  const labels = Object.keys(v).map((k) => PROJECT_FIELD_LABELS[k] ?? k)
  writeAudit({
    userId: req.user.id,
    actor: req.user.email,
    action: 'project_update',
    targetType: 'project',
    targetId: String(id),
    detail: `《${v.title ?? row.title}》${labels.join('、')}`,
    req,
  })

  res.json({
    project: asProjectItem(get('SELECT * FROM projects WHERE id = ?', id)),
    changed: true,
    fields: labels,
    ...projectFacets(),
  })
})

api.delete('/admin/projects/:id', requireAuth, (req, res) => {
  const id = Number.parseInt(req.params.id, 10)
  if (!Number.isInteger(id)) return res.status(400).json({ error: '项目 ID 不合法' })

  const row = get('SELECT id, title FROM projects WHERE id = ?', id)
  if (!row) return res.status(404).json({ error: '项目不存在' })

  run('DELETE FROM projects WHERE id = ?', id)
  writeAudit({
    userId: req.user.id,
    actor: req.user.email,
    action: 'project_delete',
    targetType: 'project',
    targetId: String(id),
    detail: `《${row.title}》`,
    req,
  })
  res.json({ deleted: true, id, ...projectFacets() })
})

/**
 * 批量删除项目。项目这一屏最小集只有删除一个动作，但仍然保留 `action` 字段 ——
 * 契约形状与文章、媒体库一致，前端共用一个 helper（见「批量操作（三屏共用）」）。
 *
 * 与单条删除同源：项目没有引用关系，删就是删，不做「被首页精选引用」之类的额外拦截 ——
 * 那会在单条与批量之间长出第二套规矩。
 */
/** 日志里的动词。项目没有回收站，`delete` 之外四个都是翻转一个开关。 */
const PROJECT_BULK_LABELS = {
  publish: '发布',
  unpublish: '转为草稿',
  feature: '设为精选',
  unfeature: '取消精选',
  delete: '删除',
}

/**
 * 批量改项目状态 / 批量删除。
 *
 * 判定同样是逐条的、**与单条同源**：目标值已经是当前值时跳过。
 * 这与单条 `PATCH` 的写法一致 —— 那边也是逐字段比对后才记 `changed`，
 * 「没变的东西不值得一条日志」。
 *
 * `featured` 与 `status` 是两个独立开关，各有各的跳过理由，互不干涉。
 * 一次把二十个项目全部设为精选是**允许**的：首页虽然只展示前三个，
 * 但「精选该有几个」是内容判断，接口不替使用者做这个决定 ——
 * 它只保证「已经是精选的不会被重复设一次」。
 */
api.post('/admin/projects/bulk', requireAuth, (req, res) => {
  const parsed = readBulkPayload(req.body, Object.keys(PROJECT_BULK_LABELS), (filter) => {
    const { whereSql, params } = projectSql(projectScope(filter))
    return { ids: all(`SELECT id FROM projects ${whereSql}`, ...params).map((r) => r.id) }
  })
  if (parsed.error) return res.status(400).json({ error: parsed.error })
  if (parsed.conflict) {
    return res.status(409).json({ error: parsed.conflict, expected: parsed.expected, actual: parsed.actual })
  }
  const { action, ids, scope, total } = parsed

  const hit = []
  const skipped = []
  for (const id of ids) {
    const row = get('SELECT id, title, status, featured FROM projects WHERE id = ?', id)
    if (!row) {
      skipped.push({ id, label: `#${id}`, reason: '项目不存在' })
      continue
    }
    let reason = null
    if (action === 'publish') reason = row.status === 'published' ? '已经是已发布' : null
    else if (action === 'unpublish') reason = row.status === 'draft' ? '已经是草稿' : null
    else if (action === 'feature') reason = row.featured ? '已经是精选' : null
    else if (action === 'unfeature') reason = !row.featured ? '不是精选' : null

    if (reason) skipped.push({ id, label: `《${row.title}》`, reason })
    else hit.push(row)
  }

  if (hit.length) {
    const now = nowIso()
    const sets =
      action === 'publish'
        ? ["status = 'published'"]
        : action === 'unpublish'
          ? ["status = 'draft'"]
          : action === 'feature'
            ? ['featured = 1']
            : action === 'unfeature'
              ? ['featured = 0']
              : null

    tx(() => {
      for (const row of hit) {
        if (action === 'delete') {
          run('DELETE FROM projects WHERE id = ?', row.id)
        } else {
          run(`UPDATE projects SET ${sets[0]}, updated_at = ? WHERE id = ?`, now, row.id)
        }
      }
    })
    writeAudit({
      userId: req.user.id,
      actor: req.user.email,
      action: 'project_bulk',
      targetType: 'project',
      detail: `${PROJECT_BULK_LABELS[action]} ${hit.length} 个项目${
        skipped.length ? `（跳过 ${skipped.length} 个）` : ''
      }${scope === 'filter' ? ' · 按当前筛选全选' : ''}：${nameSummary(hit.map((r) => r.title))}`,
      req,
    })
  }

  res.json({ action, scope, affected: hit.length, skipped, total: total ?? null, ...projectFacets() })
})

/**
 * 拖拽排序：整份顺序一次提交。
 *
 * 接的是**完整 id 列表**而不是「把 A 移到 B 前面」的增量指令 —— 后者要求服务端
 * 复现前端那套移动算法，两边算错一次顺序就静默错位。整份下发则无歧义：下标即顺序。
 *
 * 因此也要求列表**未被筛选**：筛选状态下前端只看得到一部分，它无法知道那些
 * 没显示的项目该落在哪里。这个约束在前端体现为「筛选时拖不动」，在这里体现为
 * 长度必须对得上 —— 两边都在说同一件事。
 */
api.post('/admin/projects/reorder', requireAuth, (req, res) => {
  const raw = req.body?.ids
  if (!Array.isArray(raw) || !raw.length) return res.status(400).json({ error: '需要提供项目 ID 列表' })

  const ids = raw.map((v) => Number.parseInt(String(v), 10))
  if (ids.some((n) => !Number.isInteger(n))) return res.status(400).json({ error: '项目 ID 列表里有非法值' })
  if (new Set(ids).size !== ids.length) return res.status(400).json({ error: '项目 ID 列表里有重复项' })

  const total = get('SELECT COUNT(*) AS n FROM projects')?.n ?? 0
  if (ids.length !== total) {
    return res.status(400).json({ error: `排序需要包含全部 ${total} 个项目（收到 ${ids.length} 个）` })
  }

  const now = nowIso()
  tx(() => {
    ids.forEach((id, index) => {
      run('UPDATE projects SET sort_order = ?, updated_at = ? WHERE id = ?', index, now, id)
    })
  })

  writeAudit({
    userId: req.user.id,
    actor: req.user.email,
    action: 'project_reorder',
    targetType: 'project',
    detail: `${ids.length} 个项目`,
    req,
  })

  res.json({
    reordered: ids.length,
    items: all('SELECT * FROM projects ORDER BY sort_order, id').map(asProjectItem),
  })
})

// ------------------------------------------------------------- 站点内容区块
/**
 * 结构化区块：首页与简历的文案、配图、开关。
 *
 * 存的就是前台在用的那张表（`site_sections`），所以这里改完，前台下一个请求
 * 取到的就是新内容 —— 中间没有第二份副本要同步。
 *
 * `module` 决定返回哪一屏的区块。带上限定是为了让「首页内容」屏只拿到自己那三块，
 * 不必先全量再把别人的丢掉。
 */
api.get('/admin/sections', requireAuth, (req, res) => {
  const module = String(req.query.module ?? '').trim()
  if (module && !SECTION_MODULES.includes(module)) {
    return res.status(400).json({ error: `未知的内容模块「${module}」` })
  }
  res.json({ module: module || 'all', items: readSectionsAdmin(module || null) })
})

/**
 * 保存一个区块。载荷是**整份区块文档**，不是字段级补丁 ——
 * 嵌套数组上没有「空数组 = 清空还是没改」的唯一答案，所以不做深合并。
 *
 * 不挂 `sensitiveLimiter`：改首页文案是日常内容编辑，与文章、项目同一量级；
 * 那个限流是给站点设置这类「改一次影响全站」的动作准备的（每 10 分钟 20 次），
 * 编辑一段介绍文字时反复保存几下就会被它挡住，属于把限制用错了地方。
 */
api.patch('/admin/sections/:key', requireAuth, (req, res) => {
  const key = String(req.params.key ?? '').trim()
  const parsed = validateSection(key, req.body ?? {})
  if (parsed.error) return res.status(400).json({ error: parsed.error })

  const spec = getSectionSpec(key)
  const outcome = writeSection(key, parsed.values)
  if (!outcome.ok) return res.status(400).json({ error: outcome.error })

  /* 值没变就不记日志：反复点保存不该在日志里刷出一串无信息量的行 */
  if (outcome.changed) {
    writeAudit({
      userId: req.user.id,
      actor: req.user.email,
      action: spec.action,
      targetType: 'section',
      targetId: key,
      detail: describeSectionChange(spec, outcome.fields),
      req,
    })
  }

  res.json({
    key,
    changed: outcome.changed,
    fields: outcome.fields,
    data: outcome.data,
    updatedAt: outcome.updatedAt,
  })
})

// ------------------------------------------------------------------- 媒体库

/**
 * 列表。
 *
 * `kinds` / `sorts` / `policy` 随列表一起下发，不写在前端：
 * 分组名、排序名、上传白名单都是「服务端会照着它拒收」的东西，
 * 前端各存一份就会出现「界面上有这一项，后端不认」。
 */
api.get('/admin/media', requireAuth, (req, res) => {
  const kind = String(req.query.kind ?? '').trim()
  if (kind && !MEDIA_KINDS.some((k) => k.key === kind)) {
    return res.status(400).json({ error: `未知的媒体分组「${kind}」` })
  }
  const { items, sort } = readMediaAdmin({ kind, sort: String(req.query.sort ?? 'recent') })
  res.json({
    items,
    kind,
    sort,
    kinds: MEDIA_KINDS,
    sorts: MEDIA_SORT_OPTIONS,
    policy: MEDIA_POLICY,
    ...mediaFacets(),
  })
})

/**
 * 上传。
 *
 * 走**原始体**而不是 multipart：为了收一个文件去引 multer，或者手写一个
 * multipart 解析器，都是拿一个只在本地后台用的表单去换一个供应链依赖。
 * 前端 `fetch(url, { body: file })` 本来就把文件原始字节放进去了 ——
 * 文件名另放请求头（浏览器不会把它塞进 body），MIME 用 Content-Type。
 *
 * 这里的 `express.raw` 必须挂在路由上：全局那个 `express.json({ limit: '32kb' })`
 * 是给表单用的，图片随便一张都超过它。两个解析器按 Content-Type 分流，
 * 图片请求不会进 JSON 解析器。
 */
api.post(
  '/admin/media',
  requireAuth,
  express.raw({ type: () => true, limit: MAX_UPLOAD_BYTES }),
  (req, res) => {
    if (!Buffer.isBuffer(req.body)) return res.status(400).json({ error: '没有收到文件内容' })

    // 请求头只放 ASCII，所以文件名是 URI 编码过来的；解不开就退回一个占位名
    let originalName = ''
    try {
      originalName = decodeURIComponent(String(req.get('x-upload-name') ?? ''))
    } catch {
      originalName = ''
    }

    const outcome = saveUpload({
      buffer: req.body,
      originalName,
      mime: req.get('content-type'),
    })
    if (outcome.error) {
      writeAudit({
        userId: req.user.id,
        actor: req.user.email,
        action: 'media_upload',
        targetType: 'media',
        detail: `上传被拒 · ${outcome.error}`,
        result: 'failed',
        req,
      })
      return res.status(400).json({ error: outcome.error })
    }

    writeAudit({
      userId: req.user.id,
      actor: req.user.email,
      action: 'media_upload',
      targetType: 'media',
      targetId: String(outcome.row.id),
      detail: `${outcome.row.filename} · ${outcome.row.bytesLabel}`,
      req,
    })

    res.status(201).json({ item: outcome.row, ...mediaFacets() })
  }
)

/** 改信息。目前只放行替代文本 —— 文件名与地址是磁盘路径与所有引用的锚点，不在这里改。 */
api.patch('/admin/media/:id', requireAuth, (req, res) => {
  const id = Number.parseInt(req.params.id, 10)
  if (!Number.isInteger(id)) return res.status(400).json({ error: '媒体 ID 不合法' })

  const row = get('SELECT * FROM media WHERE id = ?', id)
  if (!row) return res.status(404).json({ error: '媒体不存在' })

  const parsed = validateMediaPayload(req.body ?? {})
  if (parsed.error) return res.status(400).json({ error: parsed.error })

  const changed = parsed.values.alt !== (row.alt ?? '')
  if (changed) {
    run('UPDATE media SET alt = ? WHERE id = ?', parsed.values.alt, id)
    writeAudit({
      userId: req.user.id,
      actor: req.user.email,
      action: 'media_update',
      targetType: 'media',
      targetId: String(id),
      detail: `${row.filename} · 替代文本`,
      req,
    })
  }

  res.json({
    item: mediaItemOf(get('SELECT * FROM media WHERE id = ?', id)),
    changed,
    ...mediaFacets(),
  })
})

/**
 * 删除。
 *
 * 两道门，性质不同，处理方式刻意不一样：
 *
 * 1. **来源门**：随构建产物发布的素材不可删（`public/images` 在版本库里，
 *    运行期 unlink 会在下次构建时被拷回来）。这道门**不能绕** —— 它拦的不是
 *    「代价大」，而是「这件事不成立」，`force` 只会让一句假话变成一次真操作。
 * 2. **引用门**：被引用时默认拒删，并把引用清单原样返回，`force=1` 才放行 ——
 *    这是管理员在看清代价之后的第二次确认，不是一条捷径。
 *
 * 不加这道门，删一张首页配图会静默把首页变成裂图，而日志里只有一行「删除媒体」。
 */
api.delete('/admin/media/:id', requireAuth, (req, res) => {
  const id = Number.parseInt(req.params.id, 10)
  if (!Number.isInteger(id)) return res.status(400).json({ error: '媒体 ID 不合法' })

  const row = get('SELECT * FROM media WHERE id = ?', id)
  if (!row) return res.status(404).json({ error: '媒体不存在' })

  const refs = referencesOf(row)
  const origin = originOf(row.url)
  const forced = String(req.query.force ?? '') === '1'
  const blockedByOrigin = !MEDIA_POLICY.origins[origin].removable

  if (blockedByOrigin || (refs.length && !forced)) {
    writeAudit({
      userId: req.user.id,
      actor: req.user.email,
      action: 'media_delete',
      targetType: 'media',
      targetId: String(id),
      detail: `${row.filename} · ${
        blockedByOrigin ? `来源为「${MEDIA_POLICY.origins[origin].label}」` : `被 ${refs.length} 处引用`
      }，已拦下`,
      result: 'failed',
      req,
    })
    return res.status(409).json({
      error: blockedByOrigin ? mediaDeleteBlock(row, []) : mediaDeleteBlock(row, refs),
      references: refs,
    })
  }

  const fileRemoved = removeMediaFile(row)
  run('DELETE FROM media WHERE id = ?', id)

  writeAudit({
    userId: req.user.id,
    actor: req.user.email,
    action: 'media_delete',
    targetType: 'media',
    targetId: String(id),
    detail: `${row.filename}${fileRemoved ? '（含磁盘文件）' : '（磁盘上没有文件）'}${
      refs.length ? ` · 连同 ${refs.length} 处引用一并删除` : ''
    }`,
    req,
  })

  res.json({ deleted: true, id, fileRemoved, origin, removedReferences: refs.length, ...mediaFacets() })
})

/**
 * 批量删除。
 *
 * 逐条过同一道 `mediaDeleteBlock`，能删的删（连磁盘文件一起），不能删的进 `skipped`
 * 并带上理由原样返回。不做「全有或全无」：选中 12 张里混进一张随构建发布的素材，
 * 没有理由让另外 11 张也删不掉。
 *
 * 引用扫描**整批只做一次**（`referenceIndex()` 返回一个查表函数）：逐条各扫一遍
 * 就是 N 次全表读，而选中 12 张、库里 200 篇正文的规模下，这笔账不小。
 *
 * 批量删除**不提供 force**：详情面板那条路保留逐张确认的摩擦是有意的，
 * 而一次删多张被引用的图，风险不是「多按一次确认」能盖住的 —— 所以这里直接把
 * 被引用的项摆进 `skipped`，要删就去详情面板一张一张删。
 */
api.post('/admin/media/bulk', requireAuth, (req, res) => {
  /*
   * filter 范围只认分组：媒体库的筛选条就只有分组这一个维度，
   * 所以「筛选」在这里等同于「某个分组的全部文件」。
   * 校验放在 `readMediaAdmin` 之前、复用列表那条同一个 `MEDIA_KINDS` 名单 ——
   * 「列表能显示出来的分组名」与「全选能用哪个分组」必须是同一份。
   */
  const parsed = readBulkPayload(req.body, ['delete'], (filter) => {
    const kind = String(filter.kind ?? '').trim()
    if (kind && !MEDIA_KINDS.some((k) => k.key === kind)) {
      return { error: `未知的媒体分组「${kind}」` }
    }
    // sort 不改变集合，所以取 id 时不必带上它
    return { ids: readMediaAdmin({ kind, sort: 'recent' }).items.map((i) => i.id) }
  })
  if (parsed.error) return res.status(400).json({ error: parsed.error })
  if (parsed.conflict) {
    return res.status(409).json({ error: parsed.conflict, expected: parsed.expected, actual: parsed.actual })
  }
  const { ids, scope, total } = parsed

  const lookup = referenceIndex()
  const hit = []
  const skipped = []
  for (const id of ids) {
    const row = get('SELECT * FROM media WHERE id = ?', id)
    if (!row) {
      skipped.push({ id, label: `#${id}`, reason: '媒体不存在' })
      continue
    }
    const reason = mediaDeleteBlock(row, lookup(row.url))
    if (reason) skipped.push({ id, label: row.filename, reason })
    else hit.push(row)
  }

  let fileRemoved = 0
  if (hit.length) {
    tx(() => {
      for (const row of hit) {
        if (removeMediaFile(row)) fileRemoved += 1
        run('DELETE FROM media WHERE id = ?', row.id)
      }
    })
    writeAudit({
      userId: req.user.id,
      actor: req.user.email,
      action: 'media_bulk',
      targetType: 'media',
      detail: `${hit.length} 个文件${fileRemoved < hit.length ? `（磁盘上删掉 ${fileRemoved} 个）` : '（含磁盘文件）'}${
        skipped.length ? ` · 跳过 ${skipped.length} 个` : ''
      }${scope === 'filter' ? ' · 按当前分组全选' : ''}：${nameSummary(
        hit.map((r) => r.filename),
        (n) => n
      )}`,
      req,
    })
  }

  res.json({
    action: 'delete',
    scope,
    affected: hit.length,
    skipped,
    fileRemoved,
    removedReferences: 0,
    total: total ?? null,
    ...mediaFacets(),
  })
})

// ------------------------------------------------------------------- 仪表盘
api.get('/admin/dashboard', requireAuth, (req, res) => {
  const range = [7, 30, 365].includes(Number(req.query.range)) ? Number(req.query.range) : 30
  const from = localDayOffset(range - 1)
  const prevFrom = localDayOffset(range * 2 - 1)
  const prevTo = localDayOffset(range)

  const one = (sql, ...p) => Number(get(sql, ...p)?.n ?? 0)

  const published = one("SELECT COUNT(*) AS n FROM posts WHERE status = 'published'")
  const drafts = one("SELECT COUNT(*) AS n FROM posts WHERE status = 'draft'")
  const totalViews = one('SELECT COALESCE(SUM(views), 0) AS n FROM posts')
  const visitors = one('SELECT COUNT(DISTINCT visitor) AS n FROM page_views WHERE day >= ?', from)
  const prevVisitors = one(
    'SELECT COUNT(DISTINCT visitor) AS n FROM page_views WHERE day >= ? AND day < ?',
    prevFrom,
    prevTo
  )
  const publishedIn7d = one(
    "SELECT COUNT(*) AS n FROM posts WHERE status = 'published' AND published_at >= ?",
    new Date(Date.now() - 7 * 86400000).toISOString()
  )

  // 趋势：按本地日聚合，再补齐没有访问的空日，前端不必处理缺项
  const byDay = new Map(
    all(
      'SELECT day, COUNT(*) AS n FROM page_views WHERE day >= ? GROUP BY day ORDER BY day',
      from
    ).map((r) => [r.day, Number(r.n)])
  )
  const trend = []
  for (let i = range - 1; i >= 0; i -= 1) {
    const d = localDayOffset(i)
    trend.push({ day: d.slice(5), full: d, value: byDay.get(d) ?? 0 })
  }

  const distRows = all(
    `SELECT category AS name, COUNT(*) AS n FROM posts
     WHERE status = 'published' AND category != ''
     GROUP BY category ORDER BY n DESC, category ASC LIMIT 6`
  ).map((r) => ({ name: r.name, count: Number(r.n) }))
  const distTotal = distRows.reduce((sum, r) => sum + r.count, 0)

  const recentEdits = all(
    `SELECT id, title, category, status, updated_at FROM posts ORDER BY updated_at DESC LIMIT 5`
  ).map((r) => ({
    id: r.id,
    title: r.title,
    category: r.category,
    status: r.status,
    updatedAt: formatLocal(r.updated_at),
  }))

  // 待办全部由真实状态派生，没有独立的待办表 —— 不做假数据，
  // 因而条目数会随内容状态变化（种子数据下通常只有 1–2 条）。
  const todos = []
  const noSeo = one(
    "SELECT COUNT(*) AS n FROM posts WHERE seo_description IS NULL OR seo_description = ''"
  )
  if (noSeo > 0) todos.push({ title: `为 ${noSeo} 篇文章补充 SEO 摘要`, meta: '文章' })
  const draftNoCover = one(
    "SELECT COUNT(*) AS n FROM posts WHERE status = 'draft' AND (cover_image IS NULL OR cover_image = '')"
  )
  if (draftNoCover > 0) todos.push({ title: `为 ${draftNoCover} 篇草稿补封面图`, meta: '文章' })
  const noAlt = one("SELECT COUNT(*) AS n FROM media WHERE alt IS NULL OR alt = ''")
  if (noAlt > 0) todos.push({ title: `为 ${noAlt} 个媒体文件补 alt 文本`, meta: '媒体库' })
  const settingsAge = get('SELECT MAX(updated_at) AS ts FROM site_settings')?.ts
  if (!settingsAge || Date.now() - new Date(settingsAge).getTime() > 30 * 86400000) {
    todos.push({ title: '复核站点设置与首页文案', meta: '站点设置' })
  }

  // 「本周完成」= 最近 7 天产生过写操作的模块数，分母来自站点设置
  const weeklyDone = one(
    "SELECT COUNT(DISTINCT action) AS n FROM audit_logs WHERE created_at >= ? AND result = 'success'",
    new Date(Date.now() - 7 * 86400000).toISOString()
  )
  const weeklyTarget = Number.parseInt(getSetting('weeklyTarget', '10'), 10) || 10

  res.json({
    range,
    updatedAt: formatLocal(nowIso()),
    kpis: {
      published: { value: published, delta: publishedIn7d > 0 ? `本周 +${publishedIn7d}` : '本周无新增' },
      views: { value: totalViews },
      drafts: { value: drafts },
      visitors: {
        value: visitors,
        deltaText:
          prevVisitors === 0
            ? '暂无对比数据'
            : `较上一周期 ${visitors >= prevVisitors ? '+' : ''}${(
                ((visitors - prevVisitors) / prevVisitors) * 100
              ).toFixed(1)}%`,
      },
    },
    trend,
    distribution: { total: distTotal, rows: distRows },
    recentEdits,
    todos,
    weekly: { done: weeklyDone, target: weeklyTarget },
  })
})

// ------------------------------------------------------------------- 登出兜底
