import type { ReactNode } from 'react'

interface ChipProps {
  children: ReactNode
}

/**
 * 文章卡片上的分类标签。
 *
 * 规格实测自设计稿（画布 726775085435150，节点 3:461「Chip」）：
 * 浅暖底 #F6F3EF、圆角 6、内边距 9×4、字号 10.5、Medium、字色墨-2，**无描边**。
 * `leading-[1.5]` 对应画布的 AUTO 行高，否则标签会比设计稿矮一截。
 * `self-start` 不能少：标签的父级都是纵向 flex，`inline-flex` 一样会被 cross-axis
 * 拉满整行 —— 画布上的标签是 hug contents，必须显式收回自身宽度。
 *
 * 这里刻意不做「筛选胶囊」：前台两处筛选条（博客 / 项目）各有自己的交互态样式，
 * 与「文章分类标签」是两件事 —— 混用一个组件，标签就会跟着长成按钮。
 */
export function Chip({ children }: ChipProps) {
  return (
    <span className="inline-flex self-start items-center rounded-[6px] bg-[var(--color-tag-bg)] px-[9px] py-[4px] font-cn text-[10.5px] font-medium leading-[1.5] text-[var(--color-ink-2)]">
      {children}
    </span>
  )
}
