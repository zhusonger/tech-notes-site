/**
 * 登录 / 两步验证的共用外壳：左侧深墨品牌面板 + 右侧居中卡片。
 *
 * 画布上这两屏版式完全一致（520 品牌面板 + 420 卡片），抽成外壳保证像素级一致，
 * 也避免两处各写一遍渐变的文字层级。
 */
import type { ReactNode } from 'react'
import { adminBrand, adminLoginCopy } from '../data/admin'
import { useSiteBrand } from './useSiteBrand'

/** 深底上的两档暖灰 —— 直接用不透明度折算好的色值，比节点 opacity 更可控 */
export const DARK_TEXT = '#9E9891'
export const DARK_TEXT_2 = '#6E6A65'

export function AdminAuthShell({ children }: { children: ReactNode }) {
  // 站点名称与字标来自数据库（后台可改），与前台同一份来源 —— 见 useSiteBrand 的注释
  const site = useSiteBrand()

  return (
    <div className="flex min-h-screen bg-[var(--admin-canvas)]">
      <aside className="hidden w-[520px] shrink-0 flex-col bg-[var(--color-footer-bg)] px-[48px] py-[44px] lg:flex">
        <div className="flex items-center gap-[12px]">
          <span className="inline-flex h-[34px] w-[34px] items-center justify-center rounded-[10px] bg-[var(--color-primary)] font-cn text-[17px] font-bold text-white">
            {site.monogram}
          </span>
          <span className="font-cn text-[15px] font-semibold text-white">{site.name}</span>
        </div>

        <div className="flex flex-1 flex-col justify-center gap-[16px]">
          <h2 className="font-cn text-[26px] font-bold leading-[1.35] text-white">
            {adminLoginCopy.brandTitle}
          </h2>
          <p className="max-w-[360px] font-cn text-[13px] leading-[1.85]" style={{ color: DARK_TEXT }}>
            {adminLoginCopy.brandDesc}
          </p>
        </div>

        <p className="font-cn text-[11px]" style={{ color: DARK_TEXT_2 }}>
          {site.name} · {adminBrand.sub}
        </p>
      </aside>

      <div className="flex min-w-0 flex-1 items-center justify-center px-[24px] py-[48px]">
        <div className="w-full max-w-[420px]">{children}</div>
      </div>
    </div>
  )
}

/** 卡片外壳：头 / 分隔线 / 体 / 分隔线 / 脚 */
export function AuthCard({
  icon,
  title,
  subtitle,
  children,
  foot,
}: {
  icon?: ReactNode
  title: string
  subtitle: string
  children: ReactNode
  foot: string
}) {
  return (
    <section className="overflow-hidden rounded-[18px] border border-[var(--color-line)] bg-[var(--admin-surface)] shadow-[0_18px_40px_-28px_rgba(26,23,20,0.3)]">
      <header className="flex items-start gap-[13px] px-[26px] pt-[24px] pb-[18px]">
        {icon}
        <div className="flex flex-col gap-[7px]">
          <h1 className="font-cn text-[22px] font-bold leading-none text-[var(--color-ink)]">{title}</h1>
          <p className="font-cn text-[12.5px] leading-[1.65] text-[var(--color-ink-3)]">{subtitle}</p>
        </div>
      </header>
      <div className="h-px bg-[var(--color-line)]" />
      <div className="flex flex-col gap-[16px] px-[26px] py-[22px]">{children}</div>
      <div className="h-px bg-[var(--color-line)]" />
      <footer className="px-[26px] py-[14px]">
        <p className="font-cn text-[11px] leading-[1.6] text-[var(--color-ink-3)]">{foot}</p>
      </footer>
    </section>
  )
}
