/**
 * 两步验证（画布 13:1788）—— 两段式登录的第二段。
 *
 * 输入实现说明：视觉上是 6 个格子，实际只挂一个隐藏 input 承接输入。
 * 这样粘贴、移动端数字键盘、退格都是浏览器原生的，不需要手写按键分发；
 * 高亮与光标位置由 code.length 推导。
 */
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Navigate, useLocation, useNavigate, Link } from 'react-router-dom'
import { ApiError, adminApi } from '../adminApi'
import { useAdminAuth } from '../AdminAuth'
import { AdminAuthShell, AuthCard, DARK_TEXT } from '../AdminAuthShell'
import { adminTwoFactorCopy } from '../../data/admin'
import { Button, Field, Notice, TextInput } from '../ui'
import { ShieldIcon } from '../AdminIcons'

const CODE_LENGTH = 6
const PERIOD = 30

export default function AdminTwoFactor() {
  const { user, loading, applySession } = useAdminAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const state = location.state as { ticket?: string; from?: string } | null
  const ticket = state?.ticket
  const from = state?.from ?? '/admin'
  const fallbackLogin = !ticket

  const [code, setCode] = useState('')
  const [focused, setFocused] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [remaining, setRemaining] = useState(() => PERIOD - (Math.floor(Date.now() / 1000) % PERIOD))
  const [recoveryMode, setRecoveryMode] = useState(false)
  const [recoveryCode, setRecoveryCode] = useState('')

  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    const id = window.setInterval(
      () => setRemaining(PERIOD - (Math.floor(Date.now() / 1000) % PERIOD)),
      1000
    )
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    if (!loading && user) navigate('/admin', { replace: true })
  }, [loading, user, navigate])

  const finish = useCallback(
    (result: { user: Parameters<typeof applySession>[0]; recoveryWarning?: boolean }) => {
      applySession(result.user, null)
      // 用恢复码登录后直接把用户带到账号安全页，提示其重新生成恢复码
      navigate(result.recoveryWarning ? '/admin/security' : from, { replace: true })
    },
    [applySession, from, navigate]
  )

  const submitCode = useCallback(
    async (value: string) => {
      if (!ticket || value.length !== CODE_LENGTH) return
      setBusy(true)
      setError(null)
      try {
        const result = await adminApi.verifyTwoFactor(ticket, value)
        if (result.stage === 'done') finish(result)
      } catch (err) {
        setError(err instanceof ApiError ? err.message : '验证失败，请重试')
        setCode('')
        inputRef.current?.focus()
      } finally {
        setBusy(false)
      }
    },
    [ticket]
  )

  // 输满 6 位自动提交 —— 少一次点击，也不给「输完了但要记得点按钮」留出错空间
  useEffect(() => {
    if (code.length === CODE_LENGTH && !busy) void submitCode(code)
  }, [code, busy, submitCode])

  async function handleRecoverySubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!ticket) return
    setBusy(true)
    setError(null)
    try {
      const result = await adminApi.loginWithRecoveryCode(ticket, recoveryCode.trim())
      if (result.stage === 'done') finish(result)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '恢复码验证失败')
    } finally {
      setBusy(false)
    }
  }

  const boxes = useMemo(
    () => Array.from({ length: CODE_LENGTH }, (_, i) => code[i] ?? ''),
    [code]
  )

  if (fallbackLogin) return <Navigate to="/admin/login" replace />

  return (
    <AdminAuthShell>
      <AuthCard
        icon={
          <span className="mt-[2px] inline-flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[11px] bg-[var(--color-primary-soft)]">
            <ShieldIcon className="h-[19px] w-[19px] text-[var(--color-primary)]" />
          </span>
        }
        title={recoveryMode ? adminTwoFactorCopy.recoveryTitle : adminTwoFactorCopy.title}
        subtitle={recoveryMode ? adminTwoFactorCopy.recoverySubtitle : adminTwoFactorCopy.subtitle}
        foot={recoveryMode ? adminTwoFactorCopy.recoveryFoot : adminTwoFactorCopy.foot}
      >
        {error ? <Notice tone="error">{error}</Notice> : null}

        {recoveryMode ? (
          <form onSubmit={handleRecoverySubmit} className="flex flex-col gap-[16px]" noValidate>
            <Field label={adminTwoFactorCopy.recoveryLabel} htmlFor="recovery-code">
              <TextInput
                id="recovery-code"
                value={recoveryCode}
                onChange={(e) => setRecoveryCode(e.target.value.toUpperCase())}
                placeholder={adminTwoFactorCopy.recoveryPlaceholder}
                autoFocus
                className="font-code tracking-[0.08em]"
              />
            </Field>
            <Button type="submit" block loading={busy} disabled={recoveryCode.replace(/[^0-9A-F-]/g, '').length < 9}>
              {adminTwoFactorCopy.recoverySubmit}
            </Button>
            <div className="flex items-center justify-center gap-[8px]">
              <button
                type="button"
                onClick={() => {
                  setRecoveryMode(false)
                  setError(null)
                }}
                className="font-cn text-[12px] text-[var(--color-ink-3)] hover:text-[var(--color-primary)]"
              >
                {adminTwoFactorCopy.back}
              </button>
            </div>
          </form>
        ) : (
          <div className="flex flex-col gap-[16px]">
            <div className="flex flex-col gap-[9px]">
              <span className="font-cn text-[11.5px] font-medium text-[var(--color-ink-3)]">
                验证码
              </span>
              <div
                className="relative"
                onClick={() => inputRef.current?.focus()}
                role="group"
                aria-label="六位验证码"
              >
                <input
                  ref={inputRef}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, CODE_LENGTH))}
                  onFocus={() => setFocused(true)}
                  onBlur={() => setFocused(false)}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  autoFocus
                  aria-label="六位验证码"
                  className="absolute inset-0 h-full w-full cursor-text opacity-0"
                />
                <div className="flex gap-[9px]">
                  {boxes.map((digit, index) => {
                    const active = focused && index === Math.min(code.length, CODE_LENGTH - 1)
                    return (
                      <span
                        key={index}
                        className={[
                          'flex h-[54px] flex-1 items-center justify-center rounded-[12px] border bg-[var(--admin-soft)] font-latin text-[22px] font-semibold text-[var(--color-ink)] transition-colors',
                          active
                            ? 'border-[var(--color-primary)] bg-[var(--admin-surface)]'
                            : 'border-[var(--color-line)]',
                        ].join(' ')}
                      >
                        {digit || (active ? <span className="h-[22px] w-[1.5px] animate-pulse bg-[var(--color-primary)]" /> : '')}
                      </span>
                    )
                  })}
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-[9px]">
              <div className="flex items-center justify-between">
                <span className="font-cn text-[11.5px] font-medium text-[var(--color-ink-3)]">
                  {adminTwoFactorCopy.codeLabel}
                </span>
                <span className="font-cn text-[11.5px] font-medium text-[var(--color-ink-2)]">
                  {adminTwoFactorCopy.remaining.replace('{s}', String(remaining))}
                </span>
              </div>
              <div className="h-[4px] overflow-hidden rounded-full bg-[var(--admin-soft-strong)]">
                <div
                  className="h-full rounded-full bg-[var(--color-primary)] transition-[width] duration-1000 ease-linear"
                  style={{ width: `${(remaining / PERIOD) * 100}%` }}
                />
              </div>
            </div>

            <Button
              type="button"
              block
              loading={busy}
              disabled={code.length !== CODE_LENGTH}
              onClick={() => void submitCode(code)}
            >
              {adminTwoFactorCopy.submit}
            </Button>

            <div className="flex items-center justify-center gap-[10px]">
              <button
                type="button"
                onClick={() => {
                  setRecoveryMode(true)
                  setError(null)
                }}
                className="font-cn text-[12px] font-medium text-[var(--color-primary)] hover:opacity-80"
              >
                {adminTwoFactorCopy.useRecovery}
              </button>
              <span className="h-[3px] w-[3px] rounded-full" style={{ background: DARK_TEXT }} />
              <Link
                to="/admin/login"
                replace
                className="font-cn text-[12px] text-[var(--color-ink-2)] hover:text-[var(--color-primary)]"
              >
                {adminTwoFactorCopy.back}
              </Link>
            </div>
          </div>
        )}
      </AuthCard>
    </AdminAuthShell>
  )
}
