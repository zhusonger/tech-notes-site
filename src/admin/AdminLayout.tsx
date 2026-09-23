/**
 * 后台外壳：左侧固定侧边栏 + 顶部工具条 + 内容区。
 *
 * 严格按画布「组件 / 后台侧边栏」与「组件 / 后台顶栏」排布：
 * 品牌 → 三组导航 → 弹簧 → 用户卡；顶栏 = 面包屑 + 弹簧 + 搜索 + 主操作。
 *
 * 窄屏说明：画布只给了 1440 桌面稿，没有窄屏规格。这里给外壳设 1024px 最小宽度、
 * 横向滚动，而不是擅自编一套折叠抽屉 —— 小屏形态需要先出设计再实现。
 *
 * 两种外壳（侧边栏是共用的那部分）：
 * - `AdminLayout`     常规页：顶栏放面包屑与全站搜索，内容区带内边距。
 * - `AdminWorkbench`  工作台页（文章编辑器）：**不渲染顶栏、内容区不留内边距**，
 *   由页面自己铺满整屏。编辑器的顶栏内容是「正在编辑哪一篇」的状态，只有页面
 *   自己知道，外壳无从代劳；与其让页面再挤出一条第二根顶栏，不如把整条让出去。
 */
import { useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { adminBrand, adminExtraPages, adminNav, adminDashboardCopy, adminProjectsCopy } from '../data/admin'
import { useAdminAuth } from './AdminAuth'
import { useSiteBrand } from './useSiteBrand'
import {
  BoxIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  DocIcon,
  GaugeIcon,
  HistoryIcon,
  IdCardIcon,
  ImageIcon,
  LayoutIcon,
  LogoMark,
  LogoutIcon,
  PlusIcon,
  SearchIcon,
  SlidersIcon,
  TagIcon,
  VisitorsIcon,
} from './AdminIcons'
import { Monogram } from './ui'

const navIcons: Record<string, (p: { className?: string }) => JSX.Element> = {
  dashboard: GaugeIcon,
  visitors: VisitorsIcon,
  posts: DocIcon,
  projects: BoxIcon,
  resume: IdCardIcon,
  media: ImageIcon,
  home: LayoutIcon,
  taxonomy: TagIcon,
  settings: SlidersIcon,
  audit: HistoryIcon,
}

const allItems = [...adminNav.flatMap((g) => g.items), ...Object.entries(adminExtraPages).map(([key, v]) => ({ key, ...v, to: `/admin/${key}` }))]

/** 当前路径 → { 分组, 页面名 }，供顶栏面包屑使用 */
function useBreadcrumb() {
  const { pathname } = useLocation()
  return allItems.find((item) => item.to === pathname) ?? { group: '内容', label: '仪表盘' }
}

/* ------------------------------------------------------------------ 侧边栏 */
/**
 * 后台侧边栏。两种外壳共用，因此它自己管自己的展开态与退出动作，
 * 不从外壳接收任何 props —— 否则每加一种外壳都要把同一批 props 再传一遍。
 */
function AdminSidebar() {
  const nav = useNavigate()
  const { pathname } = useLocation()
  const { user, signOut } = useAdminAuth()
  // 站点名称来自数据库（后台可改），与前台同一份来源 —— 见 useSiteBrand 的注释
  const site = useSiteBrand()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!menuOpen) return
    const close = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false)
    }
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setMenuOpen(false)
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', esc)
    }
  }, [menuOpen])

  // 切页时收起菜单，避免菜单停在旧页面位置
  useEffect(() => setMenuOpen(false), [pathname])

  const handleSignOut = async () => {
    await signOut()
    nav('/admin/login', { replace: true })
  }

  return (
    <aside className="flex w-[248px] shrink-0 flex-col border-r border-[var(--color-line)] bg-[var(--admin-surface)]">
      <div className="flex items-center gap-[10px] px-[20px] py-[20px]">
        <LogoMark className="h-[30px] w-[30px]" />
        <div className="flex min-w-0 flex-col gap-[3px]">
          <span className="truncate font-cn text-[12.5px] font-semibold leading-none text-[var(--color-ink)]">
            {site.name}
          </span>
          <span className="font-cn text-[10.5px] leading-none text-[var(--color-ink-3)]">
            {adminBrand.sub}
          </span>
        </div>
      </div>

      <nav className="flex flex-col gap-[18px] px-[12px] pt-[6px]" aria-label="后台导航">
        {adminNav.map((group) => (
          <div key={group.label} className="flex flex-col gap-[3px]">
            <span className="px-[10px] pb-[5px] font-cn text-[10.5px] font-semibold tracking-[0.02em] text-[var(--admin-placeholder)]">
              {group.label}
            </span>
            {group.items.map((item) => {
              const Icon = navIcons[item.key] ?? GaugeIcon
              return (
                <NavLink
                  key={item.key}
                  to={item.to}
                  end={item.to === '/admin'}
                  className={({ isActive }) =>
                    [
                      'flex h-[36px] items-center gap-[10px] rounded-[8px] px-[10px] font-cn text-[13px] transition-colors',
                      isActive
                        ? 'bg-[var(--color-primary-soft)] font-semibold text-[var(--color-primary)]'
                        : 'text-[var(--color-ink-2)] hover:bg-[var(--admin-soft)]',
                    ].join(' ')
                  }
                >
                  <Icon className="h-[16px] w-[16px] shrink-0" />
                  <span className="truncate">{item.label}</span>
                </NavLink>
              )
            })}
          </div>
        ))}
      </nav>

      <div className="flex-1" />

      {/* --------------------------------------------------------- 用户卡 */}
      <div className="relative px-[12px] pb-[16px]" ref={menuRef}>
        {menuOpen ? (
          <div className="absolute bottom-[64px] left-[12px] right-[12px] z-20 overflow-hidden rounded-[12px] border border-[var(--color-line)] bg-[var(--admin-surface)] py-[6px] shadow-[0_12px_28px_-12px_rgba(26,23,20,0.28)]">
            <MenuItem icon={<GaugeIcon className="h-[15px] w-[15px]" />} label="账号设置" onClick={() => nav('/admin/account')} />
            <MenuItem icon={<HistoryIcon className="h-[15px] w-[15px]" />} label="账号安全" onClick={() => nav('/admin/security')} />
            <div className="my-[5px] h-px bg-[var(--color-line)]" />
            <MenuItem icon={<LogoutIcon className="h-[15px] w-[15px]" />} label="退出登录" onClick={() => void handleSignOut()} />
          </div>
        ) : null}

        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          className="flex w-full items-center gap-[10px] rounded-[12px] border border-[var(--admin-soft-strong)] bg-[var(--admin-readonly)] px-[10px] py-[9px] text-left transition-colors hover:border-[var(--color-primary)]"
        >
          <Monogram text={(user?.displayName ?? 'A').slice(0, 1)} size={30} />
          <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
            <span className="truncate font-cn text-[12.5px] font-semibold leading-none text-[var(--color-ink)]">
              {user?.displayName ?? '未登录'}
            </span>
            <span className="truncate font-latin text-[10.5px] leading-none text-[var(--color-ink-3)]">
              {user?.role === 'super_admin' ? 'Super Admin' : (user?.role ?? '')}
            </span>
          </span>
          <ChevronDownIcon className="h-[14px] w-[14px] shrink-0 text-[var(--color-ink-3)]" />
        </button>
      </div>
    </aside>
  )
}

/* -------------------------------------------------------------- 常规外壳 */
/**
 * 顶栏右上角那颗主操作。
 *
 * 画布上文章屏写的是「新建文章」、项目屏写的是「新建项目」—— 同一颗按钮在不同页面
 * 指向不同的新建对象。命不中映射时沿用「新建文章」，这与立这个映射之前的行为一致，
 * 不会让已经验收过的几屏悄悄变样。
 *
 * 「新建项目」的落点是 `?new=1` 而不是新开一屏：项目的编辑态是个弹层，
 * 让地址里带一个标记，刷新之后那一屏还在。
 */
const primaryActions: { match: (p: string) => boolean; label: string; to: string }[] = [
  { match: (p) => p.startsWith('/admin/projects'), label: adminProjectsCopy.newProject, to: '/admin/projects?new=1' },
]

export function AdminLayout() {
  const nav = useNavigate()
  const { pathname } = useLocation()
  const crumb = useBreadcrumb()
  const primary = primaryActions.find((a) => a.match(pathname)) ?? {
    label: adminDashboardCopy.newPost,
    to: '/admin/posts/new',
  }

  return (
    <div className="flex h-screen min-w-[1024px] overflow-hidden bg-[var(--admin-canvas)]">
      <AdminSidebar />

      {/* ------------------------------------------------------------- 主区域 */}
      <div className="flex min-w-0 flex-1 flex-col bg-[var(--admin-canvas)]">
        <header className="flex h-[64px] shrink-0 items-center gap-[16px] border-b border-[var(--color-line)] bg-[var(--admin-surface)] px-[28px]">
          <nav className="flex items-center gap-[8px]" aria-label="面包屑">
            <span className="font-cn text-[13px] text-[var(--color-ink-3)]">{crumb.group}</span>
            <ChevronRightIcon className="h-[13px] w-[13px] text-[var(--admin-placeholder)]" />
            <span className="font-cn text-[13.5px] font-semibold text-[var(--color-ink)]">{crumb.label}</span>
          </nav>

          <div className="flex-1" />

          <div
            className="flex h-[34px] w-[236px] items-center gap-[8px] rounded-[10px] border border-[var(--color-line)] bg-[var(--admin-soft)] px-[11px]"
            title="搜索在「文章管理」接入后可用（下一迭代）"
          >
            <SearchIcon className="h-[14px] w-[14px] shrink-0 text-[var(--admin-placeholder)]" />
            <input
              disabled
              placeholder={adminDashboardCopy.searchPlaceholder}
              aria-label={adminDashboardCopy.searchPlaceholder}
              className="w-full bg-transparent font-cn text-[12.5px] text-[var(--color-ink)] outline-none placeholder:text-[var(--admin-placeholder)] disabled:cursor-not-allowed"
            />
          </div>

          <button
            type="button"
            onClick={() => nav(primary.to)}
            className="inline-flex h-[34px] items-center gap-[6px] rounded-[10px] bg-[var(--color-primary)] px-[14px] font-cn text-[12.5px] font-medium text-white transition-colors hover:bg-[var(--color-primary-deep)]"
          >
            <PlusIcon className="h-[14px] w-[14px]" />
            {primary.label}
          </button>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto px-[28px] py-[26px]">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------ 工作台外壳 */
/**
 * 工作台外壳：只有侧边栏，顶栏与内边距都交给页面。
 * 画布上文章编辑屏的顶栏是「返回 / 正在编辑的文章 / 预览 / 更多 / 发布」，
 * 与常规页顶栏的「面包屑 / 搜索 / 新建」完全不是一回事，因此整条让出去。
 */
export function AdminWorkbench() {
  return (
    <div className="flex h-screen min-w-[1024px] overflow-hidden bg-[var(--admin-canvas)]">
      <AdminSidebar />
      <div className="flex min-w-0 flex-1 flex-col bg-[var(--admin-canvas)]">
        <Outlet />
      </div>
    </div>
  )
}

function MenuItem({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="flex w-full items-center gap-[9px] px-[12px] py-[8px] text-left font-cn text-[12.5px] text-[var(--color-ink-2)] transition-colors hover:bg-[var(--admin-soft)] hover:text-[var(--color-ink)]"
    >
      {icon}
      {label}
    </button>
  )
}
