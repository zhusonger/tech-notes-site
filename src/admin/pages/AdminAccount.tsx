/**
 * 账号设置（画布 13:1841）。
 *
 * 四个分区：个人资料 / 修改密码 / 登录设备 / 会话与安全。
 * 首次启动由服务端生成的强随机密码登录进来时，`mustChangePassword` 为真 ——
 * 这时默认落在「修改密码」并给出提示，而不是让人自己去找。
 */
import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { ApiError, adminApi } from '../adminApi'
import { useAdminAuth } from '../AdminAuth'
import { adminAccountCopy } from '../../data/admin'
import { DevicesCard, PasswordCard } from '../sections'
import { AdminCard, Button, CardFoot, CardHead, Field, Notice, PageHeader, Monogram, ReadonlyValue, SectionNavCard, TextInput } from '../ui'
import { LockIcon, LogoutIcon } from '../AdminIcons'

type SectionKey = 'profile' | 'password' | 'devices' | 'security'

export default function AdminAccount() {
  const { user, refresh, signOut } = useAdminAuth()
  const navigate = useNavigate()
  const [section, setSection] = useState<SectionKey>(() =>
    user?.mustChangePassword ? 'password' : 'profile'
  )

  const handleSignOut = async () => {
    await signOut()
    navigate('/admin/login', { replace: true })
  }

  return (
    <div className="flex flex-col gap-[20px]">
      <PageHeader
        title={adminAccountCopy.pageTitle}
        subtitle={adminAccountCopy.pageSubtitle}
        right={
          <Button variant="outline" icon={<LogoutIcon className="h-[15px] w-[15px]" />} onClick={() => void handleSignOut()}>
            {adminAccountCopy.logout}
          </Button>
        }
      />

      {user?.mustChangePassword && section !== 'password' ? (
        <Notice tone="warn">
          当前使用的是系统生成的初始密码，请尽快在「修改密码」中更换。
          <button type="button" onClick={() => setSection('password')} className="ml-[6px] font-medium underline">
            去修改
          </button>
        </Notice>
      ) : null}

      <div className="flex items-start gap-[20px]">
        <SectionNavCard items={adminAccountCopy.sections} active={section} onChange={setSection} />

        <div className="flex min-w-0 flex-1 flex-col gap-[16px]">
          {section === 'profile' ? (
            <ProfileCardInner key={user?.displayName ?? 'anonymous'} refresh={refresh} />
          ) : null}

          {section === 'password' ? (
            <AdminCard>
              <CardHead title={adminAccountCopy.password.title} subtitle={adminAccountCopy.password.subtitle} />
              <PasswordCard />
            </AdminCard>
          ) : null}

          {section === 'devices' ? (
            <AdminCard>
              <CardHead title={adminAccountCopy.devices.title} subtitle={adminAccountCopy.devices.subtitle} />
              <DevicesCard />
            </AdminCard>
          ) : null}

          {section === 'security' ? (
            <AdminCard>
              <CardHead title={adminAccountCopy.security.title} subtitle={adminAccountCopy.security.subtitle} />
              <div className="flex flex-col gap-[16px] px-[24px] py-[22px]">
                <p className="font-cn text-[12.5px] leading-[1.75] text-[var(--color-ink-2)]">
                  {adminAccountCopy.security.desc}
                </p>
                <div>
                  <Button variant="outline" onClick={() => navigate('/admin/security')}>
                    {adminAccountCopy.security.go}
                  </Button>
                </div>
              </div>
            </AdminCard>
          ) : null}
        </div>
      </div>
    </div>
  )
}

/** 单独抽出来是为了用 key 重置内部草稿态 —— 保存成功后与服务端值重新对齐。 */
function ProfileCardInner({ refresh }: { refresh: () => Promise<void> }) {
  const { user, applySession } = useAdminAuth()
  const [displayName, setDisplayName] = useState(user?.displayName ?? '')
  const [saved, setSaved] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setDisplayName(user?.displayName ?? '')
  }, [user?.displayName])

  const dirty = Boolean(user) && displayName.trim() !== user?.displayName

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!user) return
    setBusy(true)
    setError(null)
    setSaved(null)
    try {
      const result = await adminApi.updateAccount(displayName.trim())
      applySession(result.user)
      await refresh()
      setSaved(result.updatedAt)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '保存失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AdminCard>
      <form onSubmit={submit} noValidate>
        <CardHead
          title={adminAccountCopy.profile.title}
          subtitle={adminAccountCopy.profile.subtitle}
        />

        <div className="flex flex-col gap-[20px] px-[24px] py-[22px]">
          {error ? <Notice tone="error">{error}</Notice> : null}
          {saved ? <Notice tone="success">{adminAccountCopy.profile.saved}</Notice> : null}

          <Field label={adminAccountCopy.profile.avatarLabel}>
            <div className="flex items-center gap-[16px]">
              <Monogram text={(displayName || user?.displayName || 'A').slice(0, 1)} size={64} />
              <div className="flex flex-col items-start gap-[7px]">
                <Button
                  variant="outline"
                  size="sm"
                  disabled
                  title="头像上传依赖媒体库，将在「媒体库」接入后开放"
                >
                  {adminAccountCopy.profile.changeAvatar}
                </Button>
                <span className="max-w-[320px] font-cn text-[10.5px] leading-[1.6] text-[var(--color-ink-3)]">
                  {adminAccountCopy.profile.avatarHint}
                </span>
              </div>
            </div>
          </Field>

          <div className="grid grid-cols-2 gap-[16px]">
            <Field label={adminAccountCopy.profile.displayName} htmlFor="acc-name">
              <TextInput
                id="acc-name"
                value={displayName}
                maxLength={40}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </Field>
            <Field label={adminAccountCopy.profile.email} hint={adminAccountCopy.profile.emailHint}>
              <ReadonlyValue>{user?.email ?? ''}</ReadonlyValue>
            </Field>
          </div>

          <Field label={adminAccountCopy.profile.role} hint={adminAccountCopy.profile.roleHint}>
            <ReadonlyValue icon={<LockIcon className="h-[14px] w-[14px] text-[var(--color-ink-3)]" />}>
              {user?.role === 'super_admin'
                ? adminAccountCopy.profile.roleValue
                : adminAccountCopy.profile.roleValuePlain}
            </ReadonlyValue>
          </Field>
        </div>

        <CardFoot
          left={adminAccountCopy.profile.savedAt.replace(
            '{time}',
            saved ? new Date(saved).toLocaleString('zh-CN', { hour12: false }) : '尚未修改'
          )}
        >
          <Button
            variant="outline"
            size="sm"
            disabled={!dirty}
            onClick={() => setDisplayName(user?.displayName ?? '')}
          >
            {adminAccountCopy.profile.cancel}
          </Button>
          <Button type="submit" size="sm" loading={busy} disabled={!dirty || !displayName.trim()}>
            {adminAccountCopy.profile.save}
          </Button>
        </CardFoot>
      </form>
    </AdminCard>
  )
}
