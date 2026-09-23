/**
 * 账号安全（画布 13:1922）。
 *
 * 四个分区：登录密码 / 两步验证 / 恢复码 / 登录设备。
 *
 * 两处与画布的有意分歧（都是安全取舍，已在交付说明里点出）：
 * 1. 已启用状态下**不回显** TOTP 密钥与二维码。回显等于把「会话被盗」升级为
 *    「第二因素被静默克隆」，2FA 就白做了。换认证器的路径是先关闭再重新绑定。
 * 2. 恢复码库里只存 sha256（服务端无法还原明文），因此这里渲染的是 8 个**占位格**，
 *    按「可用 / 已使用」着色；明文只在刚生成的那一刻展示一次。
 */
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { ApiError, adminApi, type TwoFactorSetup, type TwoFactorStatus } from '../adminApi'
import { useAdminAuth } from '../AdminAuth'
import { adminSecurityCopy as copy } from '../../data/admin'
import { DevicesCard, PasswordCard } from '../sections'
import {
  AdminCard,
  Badge,
  Button,
  CardFoot,
  CardHead,
  Field,
  Notice,
  PageHeader,
  ReadonlyValue,
  SectionNavCard,
  TextInput,
} from '../ui'
import { AlertIcon, CopyIcon, LockIcon, RefreshIcon, ShieldIcon } from '../AdminIcons'

type SectionKey = 'password' | 'twofa' | 'recovery' | 'devices'

export default function AdminSecurity() {
  const { user, refresh } = useAdminAuth()
  const [section, setSection] = useState<SectionKey>('twofa')
  const [status, setStatus] = useState<TwoFactorStatus | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      setStatus(await adminApi.twoFactorStatus())
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '加载两步验证状态失败')
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const enabled = Boolean(status?.enabled)

  return (
    <div className="flex flex-col gap-[20px]">
      <PageHeader
        title={copy.pageTitle}
        subtitle={copy.pageSubtitle}
        right={
          <Badge tone={enabled ? 'success' : 'muted'}>
            <span className="inline-flex items-center gap-[5px]">
              <ShieldIcon className="h-[12px] w-[12px]" />
              {enabled ? copy.enabledBadge : copy.disabledBadge}
            </span>
          </Badge>
        }
      />

      {error ? <Notice tone="error">{error}</Notice> : null}

      <div className="flex items-start gap-[20px]">
        <SectionNavCard items={copy.sections} active={section} onChange={setSection} />

        <div className="flex min-w-0 flex-1 flex-col gap-[16px]">
          {section === 'password' ? (
            <AdminCard>
              <CardHead title={copy.sections[0].label} subtitle="修改后其他设备的会话会立即失效" />
              <PasswordCard />
            </AdminCard>
          ) : null}

          {section === 'twofa' ? (
            <TwoFactorCard status={status} onChanged={load} refreshAuth={refresh} />
          ) : null}

          {section === 'recovery' ? <RecoveryCard status={status} onChanged={load} /> : null}

          {section === 'devices' ? (
            <AdminCard>
              <CardHead title="登录设备" subtitle="当前账号的有效会话，可逐条吊销" />
              <DevicesCard />
            </AdminCard>
          ) : null}

          <p className="font-cn text-[11px] text-[var(--color-ink-3)]">
            当前管理员 · {user?.displayName ?? ''}
          </p>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ 两步验证 */
function TwoFactorCard({
  status,
  onChanged,
  refreshAuth,
}: {
  status: TwoFactorStatus | null
  onChanged: () => Promise<void>
  refreshAuth: () => Promise<void>
}) {
  const [setup, setSetup] = useState<TwoFactorSetup | null>(null)
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [freshCodes, setFreshCodes] = useState<string[] | null>(null)
  const [disabling, setDisabling] = useState(false)
  const [password, setPassword] = useState('')

  const enabled = Boolean(status?.enabled)

  async function startSetup() {
    setBusy(true)
    setError(null)
    try {
      setSetup(await adminApi.setupTwoFactor())
      setCode('')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '生成密钥失败')
    } finally {
      setBusy(false)
    }
  }

  async function confirmEnable(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const result = await adminApi.enableTwoFactor(code, '认证器应用')
      setFreshCodes(result.recoveryCodes)
      setSetup(null)
      setCode('')
      await onChanged()
      await refreshAuth()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '启用失败')
    } finally {
      setBusy(false)
    }
  }

  async function confirmDisable(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await adminApi.disableTwoFactor(password)
      setDisabling(false)
      setPassword('')
      setFreshCodes(null)
      await onChanged()
      await refreshAuth()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '关闭失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AdminCard>
      <CardHead
        title={copy.twofa.title}
        subtitle={copy.twofa.subtitle}
        right={<Badge tone={enabled ? 'success' : 'muted'}>{enabled ? copy.twofa.badgeEnabled : copy.twofa.badgeDisabled}</Badge>}
      />

      <div className="flex flex-col gap-[18px] px-[24px] py-[22px]">
        {error ? <Notice tone="error">{error}</Notice> : null}

        {/* 状态提示条 */}
        <div className="flex items-start gap-[9px] rounded-[10px] border border-[var(--color-line)] bg-[var(--admin-soft)] px-[13px] py-[10px]">
          <ShieldIcon className="mt-[1px] h-[15px] w-[15px] shrink-0 text-[var(--color-primary)]" />
          <p className="font-cn text-[12px] leading-[1.65] text-[var(--color-ink-2)]">
            {enabled
              ? copy.twofa.enabledStrip.replace('{time}', status?.confirmedAt ? new Date(status.confirmedAt).toLocaleString('zh-CN', { hour12: false }) : '—')
              : copy.twofa.disabledStrip}
          </p>
        </div>

        {!enabled && !setup ? (
          <div>
            <Button loading={busy} onClick={() => void startSetup()} icon={<ShieldIcon className="h-[15px] w-[15px]" />}>
              {copy.twofa.startSetup}
            </Button>
          </div>
        ) : null}

        {!enabled && setup ? (
          <div className="flex flex-col gap-[18px]">
            <div className="flex gap-[22px]">
              <div className="flex min-w-0 flex-1 flex-col gap-[14px]">
                <Field label={copy.twofa.appLabel}>
                  <ReadonlyValue>{copy.twofa.appValue}</ReadonlyValue>
                </Field>
                <Field label={copy.twofa.secretLabel} hint={copy.twofa.secretHint}>
                  <div className="flex items-center gap-[8px]">
                    <code className="flex h-[38px] min-w-0 flex-1 items-center overflow-x-auto rounded-[10px] border border-[var(--color-line)] bg-[var(--admin-soft-strong)] px-[13px] font-code text-[12.5px] tracking-[0.06em] text-[var(--color-ink)]">
                      {setup.secret}
                    </code>
                    <CopyButton value={setup.secret} />
                  </div>
                </Field>
              </div>
              <div className="flex flex-col items-center gap-[8px]">
                <img
                  src={setup.qrDataUrl}
                  alt="两步验证二维码"
                  width={132}
                  height={132}
                  className="rounded-[12px] border border-[var(--color-line)] bg-white p-[6px]"
                />
                <span className="font-cn text-[10.5px] text-[var(--color-ink-3)]">{copy.twofa.qrHint}</span>
              </div>
            </div>

            <form onSubmit={confirmEnable} className="flex flex-col gap-[14px]" noValidate>
              <Field label={copy.twofa.codeLabel} htmlFor="totp-enable-code">
                <TextInput
                  id="totp-enable-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="000000"
                  className="max-w-[180px] font-latin tracking-[0.24em]"
                />
              </Field>
              <div className="flex items-center gap-[10px]">
                <Button type="submit" loading={busy} disabled={code.length !== 6}>
                  {copy.twofa.confirm}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setSetup(null)
                    setCode('')
                  }}
                >
                  {copy.twofa.cancel}
                </Button>
              </div>
            </form>
          </div>
        ) : null}

        {enabled ? (
          <div className="flex flex-col gap-[16px]">
            <div className="grid grid-cols-2 gap-[16px]">
              <Field label={copy.twofa.appLabel}>
                <ReadonlyValue>{copy.twofa.appValue}</ReadonlyValue>
              </Field>
              <Field label={copy.twofa.boundAt}>
                <ReadonlyValue>
                  {status?.confirmedAt ? new Date(status.confirmedAt).toLocaleString('zh-CN', { hour12: false }) : '—'}
                </ReadonlyValue>
              </Field>
            </div>

            <div className="flex flex-col items-start gap-[10px] rounded-[12px] border border-dashed border-[var(--color-line)] bg-[var(--admin-soft)] px-[16px] py-[14px]">
              <div className="flex items-start gap-[9px]">
                <LockIcon className="mt-[1px] h-[15px] w-[15px] shrink-0 text-[var(--color-ink-3)]" />
                <p className="font-cn text-[11.5px] leading-[1.7] text-[var(--color-ink-2)]">
                  密钥与二维码不在已启用状态下回显 —— 回显会让会话被盗直接升级为第二因素被克隆。
                  需要更换认证器时，请先关闭两步验证再重新绑定。
                </p>
              </div>
            </div>

            {/* 危险区 */}
            <div className="h-px bg-[var(--color-line)]" />
            <div className="flex flex-wrap items-center justify-between gap-[14px]">
              <div className="flex min-w-0 flex-col gap-[4px]">
                <span className="font-cn text-[12.5px] font-medium text-[var(--color-ink)]">
                  {copy.twofa.disableTitle}
                </span>
                <span className="font-cn text-[11px] text-[var(--color-ink-3)]">{copy.twofa.disableHint}</span>
              </div>
              {!disabling ? (
                <Button variant="danger" onClick={() => setDisabling(true)}>
                  {copy.twofa.disable}
                </Button>
              ) : null}
            </div>

            {disabling ? (
              <form onSubmit={confirmDisable} className="flex flex-col gap-[12px] rounded-[10px] border border-[#f0cfc0] bg-[#fdf3ee] px-[14px] py-[13px]" noValidate>
                <div className="flex items-start gap-[9px]">
                  <AlertIcon className="mt-[1px] h-[15px] w-[15px] shrink-0 text-[#b4460c]" />
                  <p className="font-cn text-[11.5px] leading-[1.6] text-[#b4460c]">{copy.twofa.disablePrompt}</p>
                </div>
                <Field label={copy.twofa.passwordLabel} htmlFor="disable-password">
                  <TextInput
                    id="disable-password"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </Field>
                <div className="flex items-center gap-[10px]">
                  <Button type="submit" variant="danger" loading={busy} disabled={!password}>
                    {copy.twofa.confirmDisable}
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setDisabling(false)
                      setPassword('')
                    }}
                  >
                    取消
                  </Button>
                </div>
              </form>
            ) : null}
          </div>
        ) : null}
      </div>

      {freshCodes ? (
        <FreshCodes codes={freshCodes} onClose={() => setFreshCodes(null)} />
      ) : null}

      <CardFoot left={enabled ? copy.twofa.footEnabled : copy.twofa.footDisabled} />
    </AdminCard>
  )
}

/* ------------------------------------------------------------------ 恢复码 */
function RecoveryCard({
  status,
  onChanged,
}: {
  status: TwoFactorStatus | null
  onChanged: () => Promise<void>
}) {
  const [freshCodes, setFreshCodes] = useState<string[] | null>(null)
  const [prompting, setPrompting] = useState(false)
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const total = status?.recovery.total ?? 0
  const remaining = status?.recovery.remaining ?? 0

  async function regenerate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const result = await adminApi.regenerateRecoveryCodes(password)
      setFreshCodes(result.recoveryCodes)
      setPrompting(false)
      setPassword('')
      await onChanged()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '生成失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AdminCard>
      <CardHead
        title={copy.recovery.title}
        right={
          total > 0 ? (
            <span className="font-cn text-[11.5px] text-[var(--color-ink-3)]">
              {copy.recovery.remaining.replace('{n}', String(remaining))}
            </span>
          ) : null
        }
      />

      <div className="flex flex-col gap-[16px] px-[24px] py-[22px]">
        {error ? <Notice tone="error">{error}</Notice> : null}

        {total === 0 ? (
          <p className="font-cn text-[12.5px] leading-[1.7] text-[var(--color-ink-3)]">
            {copy.recovery.none}
          </p>
        ) : (
          <>
            <div className="flex flex-col gap-[7px]">
              <span className="font-cn text-[11.5px] font-medium text-[var(--color-ink-3)]">
                {copy.recovery.label}
              </span>
              <div className="grid grid-cols-4 gap-[10px]">
                {Array.from({ length: total }, (_, i) => {
                  const available = i < remaining
                  return (
                    <span
                      key={i}
                      className={[
                        'flex h-[34px] items-center justify-center rounded-[9px] border font-code text-[12.5px] tracking-[0.06em]',
                        available
                          ? 'border-[var(--color-line)] bg-[var(--admin-soft-strong)] text-[var(--color-ink-2)]'
                          : 'border-dashed border-[var(--color-line)] bg-transparent text-[var(--admin-placeholder)] line-through',
                      ].join(' ')}
                    >
                      ••••-••••
                    </span>
                  )
                })}
              </div>
              <p className="font-cn text-[10.5px] leading-[1.6] text-[var(--color-ink-3)]">
                {copy.recovery.hint} · 明文只在生成时展示一次，服务端只存哈希，无法在此回显
              </p>
            </div>

            {!prompting ? (
              <div>
                <Button variant="outline" icon={<RefreshIcon className="h-[15px] w-[15px]" />} onClick={() => setPrompting(true)}>
                  {copy.recovery.regenerate}
                </Button>
              </div>
            ) : (
              <form onSubmit={regenerate} className="flex flex-col gap-[12px] rounded-[10px] border border-[var(--color-line)] bg-[var(--admin-soft)] px-[14px] py-[13px]" noValidate>
                <p className="font-cn text-[11.5px] leading-[1.6] text-[var(--color-ink-2)]">
                  {copy.recovery.regeneratePrompt}
                </p>
                <Field label={copy.twofa.passwordLabel} htmlFor="regen-password">
                  <TextInput
                    id="regen-password"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </Field>
                <div className="flex items-center gap-[10px]">
                  <Button type="submit" loading={busy} disabled={!password}>
                    {copy.recovery.regenerate}
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setPrompting(false)
                      setPassword('')
                    }}
                  >
                    取消
                  </Button>
                </div>
              </form>
            )}
          </>
        )}
      </div>

      {freshCodes ? <FreshCodes codes={freshCodes} onClose={() => setFreshCodes(null)} /> : null}

      <CardFoot left="重新生成后，旧恢复码立即作废" />
    </AdminCard>
  )
}

/* ------------------------------------------------------------------ 明文恢复码 */
function FreshCodes({ codes, onClose }: { codes: string[]; onClose: () => void }) {
  const [copied, setCopied] = useState(false)

  const copyAll = async () => {
    try {
      await navigator.clipboard.writeText(codes.join('\n'))
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  return (
    <>
      <div className="h-px bg-[var(--color-line)]" />
      <div className="flex flex-col gap-[14px] bg-[#fdfaf6] px-[24px] py-[20px]">
        <div className="flex items-start gap-[9px]">
          <AlertIcon className="mt-[1px] h-[15px] w-[15px] shrink-0 text-[#a8611a]" />
          <div className="flex flex-col gap-[3px]">
            <span className="font-cn text-[12.5px] font-semibold text-[var(--color-ink)]">
              {copy.recovery.freshTitle}
            </span>
            <span className="font-cn text-[11px] text-[var(--color-ink-2)]">{copy.recovery.freshHint}</span>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-[10px]">
          {codes.map((code) => (
            <span
              key={code}
              className="flex h-[34px] items-center justify-center rounded-[9px] border border-[var(--color-line)] bg-[var(--admin-surface)] font-code text-[12.5px] tracking-[0.06em] text-[var(--color-ink)]"
            >
              {code}
            </span>
          ))}
        </div>

        <div className="flex items-center gap-[10px]">
          <Button variant="outline" icon={<CopyIcon className="h-[15px] w-[15px]" />} onClick={() => void copyAll()}>
            {copied ? copy.recovery.copied : copy.recovery.copy}
          </Button>
          <Button onClick={onClose}>{copy.recovery.close}</Button>
        </div>
      </div>
    </>
  )
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <Button
      variant="outline"
      onClick={() => {
        navigator.clipboard
          .writeText(value)
          .then(() => {
            setCopied(true)
            window.setTimeout(() => setCopied(false), 1500)
          })
          .catch(() => setCopied(false))
      }}
      icon={<CopyIcon className="h-[15px] w-[15px]" />}
    >
      {copied ? '已复制' : '复制'}
    </Button>
  )
}
