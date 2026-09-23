/**
 * 账号页与账号安全页共用的两个分区：修改密码、登录设备。
 *
 * 两个页面都有这两个分区（画布上是各自的分区导航项），抽出来避免同一套
 * 校验与吊销逻辑写两遍、日后改一处漏一处。
 */
import { useEffect, useState, type FormEvent } from 'react'
import { ApiError, adminApi, type SessionRow } from './adminApi'
import { adminAccountCopy as accountCopy } from '../data/admin'
import { Button, Field, Notice, TextInput } from './ui'
import { MonitorIcon } from './AdminIcons'

/* ------------------------------------------------------------------ 修改密码 */
export function PasswordCard({ footerNote }: { footerNote?: string }) {
  const copy = accountCopy.password
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setDone(null)

    if (next !== confirm) {
      setError(copy.mismatch)
      return
    }
    setBusy(true)
    try {
      await adminApi.changePassword(current, next)
      setDone(copy.done)
      setCurrent('')
      setNext('')
      setConfirm('')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '修改失败，请稍后重试')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-[16px] px-[24px] py-[22px]" noValidate>
      {error ? <Notice tone="error">{error}</Notice> : null}
      {done ? <Notice tone="success">{done}</Notice> : null}

      <Field label={copy.current} htmlFor="pwd-current">
        <TextInput
          id="pwd-current"
          type="password"
          autoComplete="current-password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          required
        />
      </Field>

      <Field label={copy.next} htmlFor="pwd-next" hint={copy.rule}>
        <TextInput
          id="pwd-next"
          type="password"
          autoComplete="new-password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          required
        />
      </Field>

      <Field label={copy.confirm} htmlFor="pwd-confirm">
        <TextInput
          id="pwd-confirm"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
          invalid={Boolean(confirm) && confirm !== next}
        />
      </Field>

      <div className="flex items-center justify-between gap-[12px] pt-[2px]">
        <span className="font-cn text-[11px] text-[var(--color-ink-3)]">{footerNote ?? ''}</span>
        <Button type="submit" loading={busy} disabled={!current || !next || !confirm}>
          {copy.submit}
        </Button>
      </div>
    </form>
  )
}

/* ------------------------------------------------------------------ 登录设备 */
/** 把 UA 串折成「系统 · 浏览器」，识别不出来就原样回退 —— 不猜。 */
export function deviceLabel(userAgent: string) {
  const ua = userAgent || ''
  if (!ua) return accountCopy.devices.unknownAgent

  const os = /iPhone|iPad|iPod/i.test(ua)
    ? 'iOS'
    : /Android/i.test(ua)
      ? 'Android'
      : /Mac OS X|Macintosh/i.test(ua)
        ? 'macOS'
        : /Windows/i.test(ua)
          ? 'Windows'
          : /Linux/i.test(ua)
            ? 'Linux'
            : ''

  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /Chrome\//.test(ua) && !/Chromium/.test(ua)
      ? 'Chrome'
      : /Safari\//.test(ua) && !/Chrome/.test(ua)
        ? 'Safari'
        : /Firefox\//.test(ua)
          ? 'Firefox'
          : /curl|node|bot|crawler/i.test(ua)
            ? '脚本客户端'
            : ''

  const label = [os, browser].filter(Boolean).join(' · ')
  return label || ua.slice(0, 60)
}

export function DevicesCard() {
  const copy = accountCopy.devices
  const [rows, setRows] = useState<SessionRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    adminApi
      .sessions()
      .then((data) => setRows(data.sessions))
      .catch((err) => setError(err instanceof ApiError ? err.message : '加载登录设备失败'))
  }, [notice])

  async function revoke(row: SessionRow) {
    setError(null)
    try {
      await adminApi.revokeSession(row.id)
      setNotice(copy.revoked)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '吊销失败')
    }
  }

  return (
    <div className="flex flex-col gap-[14px] px-[24px] py-[22px]">
      {error ? <Notice tone="error">{error}</Notice> : null}
      {notice ? (
        <Notice tone="success" onClose={() => setNotice(null)}>
          {notice}
        </Notice>
      ) : null}

      {rows === null ? (
        <p className="py-[12px] font-cn text-[12.5px] text-[var(--color-ink-3)]">正在加载…</p>
      ) : (
        <ul className="divide-y divide-[var(--color-line)] rounded-[12px] border border-[var(--color-line)]">
          {rows.map((row) => (
            <li key={row.id} className="flex items-center gap-[13px] px-[16px] py-[14px]">
              <span className="inline-flex h-[32px] w-[32px] shrink-0 items-center justify-center rounded-[9px] bg-[var(--admin-soft-strong)] text-[var(--color-ink-2)]">
                <MonitorIcon className="h-[16px] w-[16px]" />
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-[4px]">
                <span className="flex items-center gap-[8px] truncate font-cn text-[12.5px] font-medium text-[var(--color-ink)]">
                  {deviceLabel(row.userAgent)}
                  {row.current ? (
                    <span className="shrink-0 rounded-full bg-[var(--color-primary-soft)] px-[8px] py-[2px] font-cn text-[10.5px] font-medium text-[var(--color-primary)]">
                      {copy.current}
                    </span>
                  ) : null}
                </span>
                <span className="truncate font-cn text-[11px] text-[var(--color-ink-3)]">
                  {copy.created.replace('{time}', row.createdAt)} · {copy.lastSeen.replace('{time}', row.lastSeenAt)}
                  {row.ip ? ` · ${row.ip}` : ''}
                </span>
              </span>
              <Button
                variant="danger"
                size="sm"
                disabled={row.current}
                title={row.current ? '当前设备不能在此吊销，直接退出登录即可' : undefined}
                onClick={() => void revoke(row)}
              >
                {copy.revoke}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
