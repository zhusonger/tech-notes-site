import type { ReactNode } from 'react'
import type { ProjectItem } from '../data/site'
import { ExternalIcon, ForkIcon, StarIcon, techIcon } from './Icons'

interface ProjectCardProps {
  project: ProjectItem
  /** compact：首页精选项目（图标 + 文案行）；full：项目页卡片（含 stars / forks） */
  variant?: 'compact' | 'full'
}

/**
 * 卡片外壳。
 *
 * 填了仓库地址就是 `<a>`（整卡可点、新标签页打开），没填则退回 `<article>`。
 * 为什么包整卡而不是只让标题可点：卡片内部没有别的交互元素，让整块成为热区
 * 既好点，也不必为了「看起来像链接」而给标题套一套链接样式、破坏标题层级。
 *
 * `rel` 同时给 noreferrer 与 noopener：前者隐含后者，但显式写出来是为了让
 * 「这是一个外链」在代码里一眼可见。
 */
function Shell({ href, className, children }: { href?: string; className: string; children: ReactNode }) {
  if (!href) return <article className={className}>{children}</article>
  return (
    <a href={href} target="_blank" rel="noreferrer noopener" className={className}>
      {children}
    </a>
  )
}

/**
 * 外链提示图标：常显而不是仅 hover 出现。
 * 常显才能让人在移动端（没有 hover）也看得出卡片可以点；用最浅的一档墨色，
 * 不抢标题与描述的位置，hover 时随边框一起转主色。
 */
function RepoHint() {
  return (
    <ExternalIcon
      className="h-[15px] w-[15px] shrink-0 text-[var(--color-ink-3)] transition-colors group-hover:text-[var(--color-primary)]"
    />
  )
}

export function ProjectCard({ project, variant = 'full' }: ProjectCardProps) {
  const Icon = techIcon(project.language)

  /** 仓库地址在库里可为 NULL（后台允许留空），所以这里按可空处理 */
  const repo = project.repoUrl?.trim() ?? ''

  const iconTile = (
    <span className="flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-[12px] bg-[var(--color-primary-soft)] text-[var(--color-primary)]">
      <Icon className="h-[22px] w-[22px]" />
    </span>
  )

  if (variant === 'compact') {
    return (
      <Shell
        href={repo || undefined}
        className="group flex gap-[16px] rounded-[14px] border border-[var(--color-line)] bg-[var(--color-bg)] p-[20px] transition-colors hover:border-[var(--color-primary)]"
      >
        {iconTile}
        <div className="flex min-w-0 flex-col gap-[8px]">
          <div className="flex items-start justify-between gap-[12px]">
            <h3 className="font-cn text-[16px] font-medium leading-[1.45] text-[var(--color-ink)]">
              {project.title}
            </h3>
            {repo ? <RepoHint /> : null}
          </div>
          <p className="font-cn text-[13px] leading-[1.7] text-[var(--color-ink-2)]">
            {project.description}
          </p>
          <div className="flex flex-wrap items-center gap-x-[16px] gap-y-[8px] pt-[2px]">
            <span className="font-latin text-[12px] leading-none text-[var(--color-ink-3)]">
              {project.tags}
            </span>
            <span className="inline-flex items-center gap-[6px] font-latin text-[12px] leading-none text-[var(--color-ink-2)]">
              <StarIcon className="h-[14px] w-[14px] text-[var(--color-primary)]" />
              {project.starsLabel}
            </span>
          </div>
        </div>
      </Shell>
    )
  }

  return (
    <Shell
      href={repo || undefined}
      className="group flex h-full flex-col gap-[16px] rounded-[16px] border border-[var(--color-line)] bg-[var(--color-bg)] p-[24px] transition-colors hover:border-[var(--color-primary)]"
    >
      <div className="flex items-start justify-between gap-[12px]">
        {iconTile}
        {repo ? <RepoHint /> : null}
      </div>
      <h3 className="font-cn text-[18px] font-medium leading-[1.45] text-[var(--color-ink)]">
        {project.title}
      </h3>
      <p className="font-cn text-[14px] leading-[1.75] text-[var(--color-ink-2)]">
        {project.description}
      </p>
      <div className="mt-auto flex flex-col gap-[14px] pt-[6px]">
        <span className="font-latin text-[12px] leading-none text-[var(--color-ink-3)]">
          {project.tags}
        </span>
        <div className="flex items-center gap-[20px] border-t border-[var(--color-line-soft)] pt-[14px]">
          <span className="inline-flex items-center gap-[6px] font-latin text-[13px] leading-none text-[var(--color-ink-2)]">
            <StarIcon className="h-[15px] w-[15px] text-[var(--color-primary)]" />
            {project.starsLabel}
          </span>
          <span className="inline-flex items-center gap-[6px] font-latin text-[13px] leading-none text-[var(--color-ink-2)]">
            <ForkIcon className="h-[15px] w-[15px] text-[var(--color-ink-3)]" />
            {project.forksLabel}
          </span>
        </div>
      </div>
    </Shell>
  )
}
