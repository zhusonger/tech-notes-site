import type { ReactNode } from 'react'

interface SectionHeaderProps {
  title: string
  latin: string
  action?: ReactNode
}

/** 区块标题：橙色短竖线 + 中文标题 + 拉丁副标题，右侧可选动作 */
export function SectionHeader({ title, latin, action }: SectionHeaderProps) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex items-center gap-[12px]">
        <span className="block h-[22px] w-[4px] rounded-full bg-[var(--color-primary)]" />
        <h2 className="font-cn text-[26px] font-bold leading-none text-[var(--color-ink)]">
          {title}
        </h2>
        <span className="font-latin text-[14px] font-medium leading-none text-[var(--color-ink-3)]">
          {latin}
        </span>
      </div>
      {action ?? null}
    </div>
  )
}
