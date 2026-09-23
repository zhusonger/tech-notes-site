/**
 * 后台会话上下文。
 *
 * 会话本身在服务端的 httpOnly Cookie 里，前端不持有任何凭证 ——
 * 这里只缓存「当前是谁」，并在 401 时把状态清空。
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { ApiError, adminApi, type AdminUser, type TwoFactorStatus } from './adminApi'

interface AdminAuthValue {
  user: AdminUser | null
  twoFactor: TwoFactorStatus | null
  /** 首次向服务端确认身份的过程中为 true */
  loading: boolean
  refresh: () => Promise<void>
  applySession: (user: AdminUser, twoFactor?: TwoFactorStatus | null) => void
  signOut: () => Promise<void>
}

const AdminAuthContext = createContext<AdminAuthValue | null>(null)

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AdminUser | null>(null)
  const [twoFactor, setTwoFactor] = useState<TwoFactorStatus | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const data = await adminApi.me()
      setUser(data.user)
      setTwoFactor(data.twoFactor)
    } catch (err) {
      // 401 是「未登录」的正常分支，不是错误
      if (err instanceof ApiError && (err.status === 401 || err.status === 0)) {
        setUser(null)
        setTwoFactor(null)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const applySession = useCallback((next: AdminUser, nextTwoFactor?: TwoFactorStatus | null) => {
    setUser(next)
    if (nextTwoFactor !== undefined) setTwoFactor(nextTwoFactor)
    setLoading(false)
  }, [])

  const signOut = useCallback(async () => {
    try {
      await adminApi.logout()
    } finally {
      setUser(null)
      setTwoFactor(null)
    }
  }, [])

  const value = useMemo(
    () => ({ user, twoFactor, loading, refresh, applySession, signOut }),
    [user, twoFactor, loading, refresh, applySession, signOut]
  )

  return <AdminAuthContext.Provider value={value}>{children}</AdminAuthContext.Provider>
}

export function useAdminAuth() {
  const ctx = useContext(AdminAuthContext)
  if (!ctx) throw new Error('useAdminAuth 必须在 AdminAuthProvider 内使用')
  return ctx
}

/**
 * 路由守卫：未登录跳转登录页，并带上来源路径，登录后回到原处。
 * loading 期间渲染骨架，避免刷新页面时先闪一下登录页。
 */
export function RequireAdmin({ children }: { children: ReactNode }) {
  const { user, loading } = useAdminAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--admin-canvas)]">
        <div className="flex flex-col items-center gap-3">
          <span className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--color-line)] border-t-[var(--color-primary)]" />
          <p className="font-cn text-[12.5px] text-[var(--color-ink-3)]">正在校验会话…</p>
        </div>
      </div>
    )
  }

  if (!user) {
    const from = `${location.pathname}${location.search}`
    return <Navigate to="/admin/login" replace state={{ from }} />
  }

  return <>{children}</>
}
