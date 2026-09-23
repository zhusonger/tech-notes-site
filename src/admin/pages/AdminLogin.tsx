/**
 * 后台登录（画布 13:1739）。
 *
 * 两段式登录的第一段：只校验邮箱 + 密码。
 * 若账号已开启两步验证，服务端返回 stage='2fa' 与一张 5 分钟的一次性凭证，
 * 这里把凭证交给 /admin/2fa —— 凭证不进 URL，走路由 state。
 */
import { useEffect, useState, type FormEvent } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { ApiError, adminApi } from '../adminApi'
import { useAdminAuth } from '../AdminAuth'
import { AuthCard, AdminAuthShell } from '../AdminAuthShell'
import { adminLoginCopy } from '../../data/admin'
import { Button, Field, Notice, TextInput } from '../ui'
import { EyeIcon, EyeOffIcon, ShieldIcon } from '../AdminIcons'
import { CheckIcon } from '../../components/Icons'

export default function AdminLogin() {
  const { user, loading, applySession } = useAdminAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(true)
  const [reveal, setReveal] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // 从登录页跳转到 /admin/login 时带来的来源路径，登录后原样返回
  const from = (location.state as { from?: string } | null)?.from ?? '/admin'

  useEffect(() => {
    if (!loading && user) navigate('/admin', { replace: true })
  }, [loading, user, navigate])

  if (!loading && user) return <Navigate to="/admin" replace />

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const result = await adminApi.login({ email: email.trim(), password, remember })
      if (result.stage === '2fa') {
        navigate('/admin/2fa', { replace: true, state: { ticket: result.ticket, from } })
        return
      }
      applySession(result.user, null)
      navigate(from, { replace: true })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '登录失败，请稍后重试')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AdminAuthShell>
      <AuthCard title={adminLoginCopy.title} subtitle={adminLoginCopy.subtitle} foot={adminLoginCopy.foot}>
        <form onSubmit={handleSubmit} className="flex flex-col gap-[16px]" noValidate>
          {error ? <Notice tone="error">{error}</Notice> : null}

          <Field label={adminLoginCopy.emailLabel} htmlFor="admin-email">
            <TextInput
              id="admin-email"
              name="email"
              type="email"
              autoComplete="username"
              autoFocus
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </Field>

          <Field
            label={adminLoginCopy.passwordLabel}
            htmlFor="admin-password"
            right={
              <span
                className="font-cn text-[11.5px] text-[var(--color-ink-3)]"
                title="后台不提供自助找回，需由站点所有者重置"
              >
                {adminLoginCopy.forgot}
              </span>
            }
          >
            <div className="relative">
              <TextInput
                id="admin-password"
                name="password"
                type={reveal ? 'text' : 'password'}
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pr-[40px]"
              />
              <button
                type="button"
                onClick={() => setReveal((v) => !v)}
                aria-label={reveal ? '隐藏密码' : '显示密码'}
                className="absolute right-[11px] top-1/2 -translate-y-1/2 text-[var(--color-ink-3)] transition-colors hover:text-[var(--color-primary)]"
              >
                {reveal ? <EyeOffIcon className="h-[16px] w-[16px]" /> : <EyeIcon className="h-[16px] w-[16px]" />}
              </button>
            </div>
          </Field>

          <button
            type="button"
            onClick={() => setRemember((v) => !v)}
            aria-pressed={remember}
            className="flex items-center gap-[9px] self-start"
          >
            <span
              className={[
                'flex h-[17px] w-[17px] items-center justify-center rounded-[5px] border transition-colors',
                remember
                  ? 'border-[var(--color-primary)] bg-[var(--color-primary)]'
                  : 'border-[var(--color-line)] bg-[var(--admin-soft)]',
              ].join(' ')}
            >
              {remember ? <CheckIcon className="h-[11px] w-[11px] text-white" /> : null}
            </span>
            <span className="font-cn text-[12.5px] text-[var(--color-ink-2)]">{adminLoginCopy.remember}</span>
          </button>

          <Button type="submit" block loading={busy} disabled={!email || !password}>
            {adminLoginCopy.submit}
          </Button>

          <div className="flex items-start gap-[8px] rounded-[10px] border border-[var(--color-line)] bg-[var(--admin-soft)] px-[12px] py-[9px]">
            <ShieldIcon className="mt-[1px] h-[14px] w-[14px] shrink-0 text-[var(--color-primary)]" />
            <p className="font-cn text-[11.5px] leading-[1.6] text-[var(--color-ink-2)]">
              {adminLoginCopy.hint}
            </p>
          </div>
        </form>
      </AuthCard>
    </AdminAuthShell>
  )
}
