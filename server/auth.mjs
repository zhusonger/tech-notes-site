/**
 * 认证与授权 —— 密码、两步验证、会话、审计。
 *
 * 设计取舍：
 * - 会话用**服务端表**而不是 JWT：后台是单管理员场景，需要「登录设备」列表与
 *   逐条吊销能力，服务端表天然支持；也不必管理签名密钥轮换。
 * - 2FA 的 TOTP secret 落库前用 AES-256-GCM 加密：数据库文件泄露不等于 2FA 失守。
 *   密钥来自持久化的 `data/.app-secret`（或 env `APP_SECRET`），改密钥会导致历史
 *   secret 不可解密，需重新绑定 —— 这是刻意的取舍，不静默降级。
 */
import crypto from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { promisify } from 'node:util'
// otplib v13 起必须显式挂载 crypto / base32 插件，否则 verify / generateURI 运行时抛
// CryptoPluginMissingError。插件由包根统一导出，不必再单独依赖 @otplib/plugin-* 子包。
import {
  NobleCryptoPlugin,
  ScureBase32Plugin,
  generateSecret,
  generateURI,
  verify,
} from 'otplib'
import { all, dbPath, get, localDay, nowIso, run } from './db.mjs'
import { dirname } from 'node:path'

const scrypt = promisify(crypto.scrypt)

// 插件实例全模块复用
const OTP_CRYPTO = new NobleCryptoPlugin()
const OTP_BASE32 = new ScureBase32Plugin()

export const COOKIE_NAME = 'tn_admin'
const SESSION_TTL_MS = 12 * 60 * 60 * 1000 // 默认 12 小时
const REMEMBER_TTL_MS = 30 * 24 * 60 * 60 * 1000 // 勾选「保持登录」= 30 天
const TICKET_TTL_MS = 5 * 60 * 1000 // 密码通过 → 2FA 通过，中间凭证 5 分钟
const MAX_FAILED_2FA = 5

// ------------------------------------------------------------------ 应用密钥
const SECRET_FILE = process.env.APP_SECRET_FILE ?? join(dirname(dbPath), '.app-secret')

function loadAppSecret() {
  if (process.env.APP_SECRET) return { secret: process.env.APP_SECRET, source: 'env' }
  if (existsSync(SECRET_FILE)) return { secret: readFileSync(SECRET_FILE, 'utf8').trim(), source: 'file' }
  const generated = crypto.randomBytes(48).toString('base64url')
  writeFileSync(SECRET_FILE, generated, { mode: 0o600 })
  console.log(`[auth] 已生成新的应用密钥 → ${SECRET_FILE}（请勿提交到版本库）`)
  return { secret: generated, source: 'generated' }
}

const { secret: APP_SECRET, source: appSecretSource } = loadAppSecret()

/**
 * 密钥的来源，仅在「站点设置 → 集成与密钥」里以状态形式展示。
 * 值本身绝不经过接口 —— 一个能读到加密主密钥的接口等于把这层加密作废。
 */
export const APP_SECRET_SOURCE = appSecretSource
export const APP_SECRET_FILE = SECRET_FILE

// -------------------------------------------------------------- 通用小工具
export const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex')

/**
 * 访问统计用的访客指纹：加盐哈希，**每天轮换**。
 * 不持久化原始 IP/UA，也无法跨天把同一访客串起来 —— 只够支撑「当日独立访客」这一件事。
 */
export const privacyHash = (value) => sha256(`${value}|${localDay()}|${APP_SECRET}`)

const randomToken = () => crypto.randomBytes(32).toString('base64url')
const equal = (a, b) => {
  const ba = Buffer.from(String(a))
  const bb = Buffer.from(String(b))
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb)
}

// ------------------------------------------------------------------ 密码
export async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex')
  const derived = await scrypt(String(password), salt, 64, { N: 16384, r: 8, p: 1 })
  return { hash: Buffer.from(derived).toString('hex'), salt }
}

export async function verifyPassword(password, hash, salt) {
  try {
    const derived = await scrypt(String(password), salt, 64, { N: 16384, r: 8, p: 1 })
    return equal(Buffer.from(derived).toString('hex'), hash)
  } catch {
    return false
  }
}

/**
 * 密码校验：允许任意密码，只要求非空、且不超过一个上限（防滥用）。
 * 返回 null 表示通过，否则返回中文错误说明。
 * 个人站点，登录账号唯一、无其他用户，强密码规则弊大于利 —— 强制复杂度只会
 * 逼出写在便利贴上的密码，或让本人被自己定的规则挡在门外。这里只保留两道底线。
 */
export function checkPasswordStrength(password) {
  const value = String(password ?? '')
  if (value.length === 0) return '密码不能为空'
  if (value.length > 128) return '密码不能超过 128 位'
  return null
}

// ------------------------------------------------------------ TOTP secret 加密
const ENC_KEY = crypto.createHash('sha256').update(`tech-notes-2fa:${APP_SECRET}`).digest()

function encryptSecret(plain) {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', ENC_KEY, iv)
  const ct = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()])
  return `v1:${iv.toString('base64')}:${cipher.getAuthTag().toString('base64')}:${ct.toString('base64')}`
}

function decryptSecret(stored) {
  const raw = String(stored ?? '')
  if (!raw.startsWith('v1:')) return raw || null
  const [, ivB64, tagB64, ctB64] = raw.split(':')
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', ENC_KEY, Buffer.from(ivB64, 'base64'))
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'))
    return Buffer.concat([
      decipher.update(Buffer.from(ctB64, 'base64')),
      decipher.final(),
    ]).toString('utf8')
  } catch {
    return null
  }
}

// ------------------------------------------------------------------ 2FA
export const twoFactor = {
  newSecret: () => generateSecret({ crypto: OTP_CRYPTO, base32: OTP_BASE32 }),

  uri(secret, label, issuer) {
    return generateURI({
      secret,
      label,
      issuer,
      type: 'totp',
      crypto: OTP_CRYPTO,
      base32: OTP_BASE32,
    })
  },

  async check(token, secret) {
    const code = String(token ?? '').replace(/\s+/g, '')
    if (!/^\d{6}$/.test(code)) return false
    try {
      return Boolean((await verify({ token: code, secret, crypto: OTP_CRYPTO, base32: OTP_BASE32 })).valid)
    } catch {
      return false
    }
  },

  /** 保存（或替换）secret。替换后强制回到未启用状态，需重新验证一次才能启用。 */
  saveSecret(userId, secret) {
    const ts = nowIso()
    run(
      `INSERT INTO admin_2fa (user_id, secret, enabled, created_at, updated_at)
       VALUES (?, ?, 0, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET secret = excluded.secret, enabled = 0, updated_at = excluded.updated_at`,
      userId,
      encryptSecret(secret),
      ts,
      ts
    )
  },

  setEnabled(userId, enabled, deviceLabel = null) {
    const ts = nowIso()
    run(
      `UPDATE admin_2fa SET enabled = ?, device_label = ?, confirmed_at = ?, updated_at = ? WHERE user_id = ?`,
      enabled ? 1 : 0,
      deviceLabel,
      enabled ? ts : null,
      ts,
      userId
    )
  },

  /** { enabled, secret, deviceLabel, confirmedAt } | null */
  read(userId) {
    const row = get(
      'SELECT secret, enabled, device_label, confirmed_at FROM admin_2fa WHERE user_id = ?',
      userId
    )
    if (!row) return null
    return {
      enabled: Boolean(row.enabled),
      secret: row.secret ? decryptSecret(row.secret) : null,
      deviceLabel: row.device_label ?? null,
      confirmedAt: row.confirmed_at ?? null,
    }
  },

  clear(userId) {
    run('DELETE FROM admin_2fa WHERE user_id = ?', userId)
    run('DELETE FROM recovery_codes WHERE user_id = ?', userId)
  },
}

/** 恢复码：明文只在生成时返回一次，库里只存 sha256。 */
export function generateRecoveryCodes(userId, count = 8) {
  const codes = []
  const ts = nowIso()
  run('DELETE FROM recovery_codes WHERE user_id = ?', userId)
  for (let i = 0; i < count; i += 1) {
    const raw = crypto.randomBytes(4).toString('hex').toUpperCase().match(/.{4}/g).join('-')
    codes.push(raw)
    run(
      'INSERT INTO recovery_codes (user_id, code_hash, created_at) VALUES (?, ?, ?)',
      userId,
      sha256(raw),
      ts
    )
  }
  return codes
}

/** 消费一个恢复码；成功返回 true。 */
export function consumeRecoveryCode(userId, code) {
  const hash = sha256(String(code ?? '').trim().toUpperCase())
  const row = get(
    'SELECT id FROM recovery_codes WHERE user_id = ? AND code_hash = ? AND used_at IS NULL',
    userId,
    hash
  )
  if (!row) return false
  run('UPDATE recovery_codes SET used_at = ? WHERE id = ?', nowIso(), row.id)
  return true
}

export function recoveryCodeStats(userId) {
  const row = get(
    `SELECT COUNT(*) AS total, SUM(CASE WHEN used_at IS NULL THEN 1 ELSE 0 END) AS remaining
     FROM recovery_codes WHERE user_id = ?`,
    userId
  )
  return { total: row?.total ?? 0, remaining: Number(row?.remaining ?? 0) }
}

// ------------------------------------------------------------------ 会话
function sessionExpiry(remember) {
  return new Date(Date.now() + (remember ? REMEMBER_TTL_MS : SESSION_TTL_MS)).toISOString()
}

export function createSession(user, { remember, ip, userAgent }) {
  const token = randomToken()
  run(
    `INSERT INTO sessions (user_id, token_hash, remember, user_agent, ip, created_at, last_seen_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    user.id,
    sha256(token),
    remember ? 1 : 0,
    String(userAgent ?? '').slice(0, 300),
    ip ?? null,
    nowIso(),
    nowIso(),
    sessionExpiry(remember)
  )
  return { token, maxAgeSeconds: Math.floor((remember ? REMEMBER_TTL_MS : SESSION_TTL_MS) / 1000) }
}

export function readSession(token) {
  if (!token) return null
  const row = get(
    `SELECT s.id AS session_id, s.expires_at, s.user_id,
            u.email, u.display_name, u.role, u.avatar_url, u.must_change_password
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ?`,
    sha256(token)
  )
  if (!row) return null
  if (new Date(row.expires_at).getTime() <= Date.now()) {
    run('DELETE FROM sessions WHERE id = ?', row.session_id)
    return null
  }
  return row
}

export function touchSession(sessionId) {
  run('UPDATE sessions SET last_seen_at = ? WHERE id = ?', nowIso(), sessionId)
}

export function destroySession(token) {
  if (token) run('DELETE FROM sessions WHERE token_hash = ?', sha256(token))
}

export function listSessions(userId) {
  return all(
    `SELECT id, remember, user_agent, ip, created_at, last_seen_at, expires_at
     FROM sessions WHERE user_id = ? ORDER BY last_seen_at DESC`,
    userId
  )
}

export const revokeSession = (userId, id) =>
  run('DELETE FROM sessions WHERE user_id = ? AND id = ?', userId, id).changes > 0

/** 清掉过期会话与过期/已消费的登录凭证，避免表无限增长。 */
export function pruneExpired() {
  const ts = nowIso()
  run('DELETE FROM sessions WHERE expires_at <= ?', ts)
  run('DELETE FROM login_tickets WHERE expires_at <= ? OR consumed_at IS NOT NULL', ts)
}

// -------------------------------------------------------- 登录中间凭证（2FA 用）
export function createLoginTicket(user, { remember, ip, userAgent }) {
  const token = randomToken()
  run(
    `INSERT INTO login_tickets (user_id, token_hash, remember, ip, user_agent, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    user.id,
    sha256(token),
    remember ? 1 : 0,
    ip ?? null,
    String(userAgent ?? '').slice(0, 300),
    nowIso(),
    new Date(Date.now() + TICKET_TTL_MS).toISOString()
  )
  return token
}

export function readLoginTicket(token) {
  if (!token) return null
  /*
   * 取的是 `t.id AS ticket_id` + `u.id AS id`，两者**必须**分开命名。
   *
   * 这里曾经只取 `t.id`，于是调用方 `issueSession(res, row)` 把「票据 id」当成了
   * 用户 id 写进 `sessions.user_id`。只在票据 id 恰好等于用户 id 时才不报错 ——
   * 也就是只有「全新库里第一次登录」这一种情况，一旦是第二张票据就触发外键约束
   * 而 500，登录彻底失败。冒烟测试当时正好落在那个巧合上，所以是绿的。
   */
  const row = get(
    `SELECT t.id AS ticket_id, u.id AS id, t.user_id, t.remember, t.expires_at, t.consumed_at,
            u.email, u.display_name, u.role, u.avatar_url, u.must_change_password
     FROM login_tickets t JOIN users u ON u.id = t.user_id
     WHERE t.token_hash = ?`,
    sha256(token)
  )
  if (!row || row.consumed_at) return null
  if (new Date(row.expires_at).getTime() <= Date.now()) return null
  return row
}

/** 消费票据时用的是 ticket_id，不要传 row.id（那是用户 id）。 */
export const consumeLoginTicket = (id) =>
  run('UPDATE login_tickets SET consumed_at = ? WHERE id = ?', nowIso(), id)

export const MAX_2FA_ATTEMPTS = MAX_FAILED_2FA

// ------------------------------------------------------------------ 审计
export function writeAudit({
  userId = null,
  actor,
  action,
  targetType = null,
  targetId = null,
  detail = null,
  result = 'success',
  req = null,
}) {
  try {
    run(
      `INSERT INTO audit_logs (user_id, actor, action, target_type, target_id, detail, result, ip, user_agent, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      userId,
      actor ?? 'unknown',
      action,
      targetType,
      targetId ?? null,
      detail ? String(detail).slice(0, 500) : null,
      result,
      req?.ip ?? null,
      String(req?.get?.('user-agent') ?? '').slice(0, 300) || null,
      nowIso()
    )
  } catch (err) {
    // 审计失败不能把业务请求带崩
    console.error('[audit] 写入失败:', err.message)
  }
}

// ------------------------------------------------------------------ 中间件
export function attachSession(req, _res, next) {
  const token = req.cookies?.[COOKIE_NAME]
  const row = readSession(token)
  if (row) {
    touchSession(row.session_id)
    req.user = {
      id: row.user_id,
      email: row.email,
      displayName: row.display_name,
      role: row.role,
      avatarUrl: row.avatar_url,
      mustChangePassword: Boolean(row.must_change_password),
    }
    req.sessionId = row.session_id
    req.sessionToken = token
  }
  next()
}

export function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: '未登录或会话已过期' })
  next()
}

export { randomToken }
