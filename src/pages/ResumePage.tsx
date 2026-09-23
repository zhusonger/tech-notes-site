import type { ReactNode, SyntheticEvent } from 'react'
import { Container } from '../components/Container'
import { GithubIcon, MailIcon, PinIcon } from '../components/Icons'
import { useSiteContent } from '../data/SiteContent'
import { RESUME_SECTIONS } from '../../shared/sections.mjs'

const contactIcons = {
  mail: MailIcon,
  pin: PinIcon,
  github: GithubIcon,
} as const

/** id → 小节标题。与后台「模块结构」面板共用共享模块里那一份，避免两边写岔。 */
const sectionTitles = new Map<string, string>(
  RESUME_SECTIONS.map((s) => [s.id, s.label] as [string, string])
)

export default function ResumePage() {
  const { content } = useSiteContent()
  const { resume, site } = content

  /*
   * 正文由后台「模块结构」面板定顺序与显示状态（见 shared/derive.mjs 的 resumeLayoutOf）。
   * 顺序表下发前已被补齐成完整集合，所以这里可以按**渲染下标**判定「末节」——
   * 末节不画底边框，这个判断必须跟着渲染顺序走，不能钉死在某一节上。
   */
  const blocks: Record<string, ReactNode> = {
    summary: (
      <p className="font-cn text-[15px] leading-[1.95] text-[var(--color-ink-2)]">{resume.summary}</p>
    ),
    highlights: <BulletList items={resume.highlights} />,
    skills: (
      <ul className="flex flex-col gap-[14px]">
        {resume.skills.map((row) => (
          <li key={row.label} className="flex flex-col gap-[6px] sm:flex-row sm:gap-[24px]">
            <span className="w-[130px] shrink-0 font-cn text-[14px] font-medium leading-[1.7] text-[var(--color-ink)]">
              {row.label}
            </span>
            <span className="font-cn text-[14px] leading-[1.7] text-[var(--color-ink-2)]">
              {row.value}
            </span>
          </li>
        ))}
      </ul>
    ),
    experience: (
      <ul className="flex flex-col gap-[26px]">
        {resume.jobs.map((job) => (
          <li key={job.title} className="flex flex-col gap-[10px]">
            <div className="flex flex-col gap-[6px] sm:flex-row sm:items-baseline sm:justify-between">
              <span className="font-cn text-[15px] font-medium leading-[1.6] text-[var(--color-ink)]">
                {job.title}
              </span>
              <span className="font-latin text-[13px] leading-none text-[var(--color-ink-3)]">
                {job.date}
              </span>
            </div>
            <BulletList items={job.bullets} />
            {job.projects?.map((project) => (
              <div key={project.name} className="flex flex-col gap-[8px]">
                <span className="flex items-center gap-[8px] font-cn text-[14px] font-medium leading-[1.6] text-[var(--color-ink)]">
                  <span className="block h-[13px] w-[2px] shrink-0 rounded-full bg-[var(--color-line)]" />
                  {project.name}
                </span>
                <BulletList items={project.bullets} className="pl-[12px]" />
              </div>
            ))}
          </li>
        ))}
      </ul>
    ),
    education: (
      <>
        <div className="flex flex-col gap-[8px] sm:flex-row sm:items-baseline sm:justify-between">
          <div className="flex flex-col gap-[6px]">
            <span className="font-cn text-[15px] font-medium leading-none text-[var(--color-ink)]">
              {resume.education.school}
            </span>
            <span className="font-cn text-[14px] leading-none text-[var(--color-ink-2)]">
              {resume.education.major}
            </span>
          </div>
          <span className="font-latin text-[13px] leading-none text-[var(--color-ink-3)]">
            {resume.education.date}
          </span>
        </div>
        <BulletList items={[resume.education.cert]} className="mt-[18px]" />
      </>
    ),
  }

  /* 顺序表里认不出的小节直接跳过：宁可少一节，也不要因为一个陌生 id 让整页打不开 */
  const hidden = new Set(resume.layout.hidden)
  const visible = resume.layout.order.filter((id) => !hidden.has(id) && blocks[id])

  return (
    <>
      {/* 操作条 */}
      <section className="border-b border-[var(--color-line)] bg-[var(--color-bg-warm)]">
        <Container className="py-12 lg:py-14">
          <div className="flex flex-col gap-[10px]">
            <span className="font-cn text-[13px] leading-none text-[var(--color-ink-3)]">
              {resume.eyebrow}
            </span>
            <h1 className="font-cn text-[34px] font-bold leading-none text-[var(--color-ink)] md:text-[44px]">
              {resume.title}
            </h1>
            <p className="font-cn text-[15px] leading-[1.8] text-[var(--color-ink-2)]">
              {resume.description}
            </p>
          </div>
        </Container>
      </section>

      {/* 简历正文 */}
      <section className="py-12 lg:py-16">
        <Container>
          <div className="rounded-[20px] border border-[var(--color-line)] bg-[var(--color-bg)] p-[28px] lg:p-[48px]">
            {/* 抬头 */}
            <div className="flex flex-col gap-6 border-b border-[var(--color-line)] pb-8 lg:flex-row lg:items-end lg:justify-between">
              <div className="flex flex-col gap-[10px]">
                <h2 className="font-cn text-[28px] font-bold leading-none text-[var(--color-ink)]">
                  {resume.header.name}
                </h2>
                <span className="font-cn text-[15px] leading-none text-[var(--color-primary)]">
                  {resume.header.role}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-x-[22px] gap-y-[10px]">
                {resume.header.contacts.map((contact) => {
                  const Icon = contactIcons[contact.icon]
                  return (
                    <span
                      key={contact.text}
                      className="inline-flex items-center gap-[8px] font-latin text-[13px] leading-none text-[var(--color-ink-2)]"
                    >
                      <Icon className="h-[15px] w-[15px] text-[var(--color-ink-3)]" />
                      {contact.text}
                    </span>
                  )
                })}
              </div>
            </div>

            {/* 正文各节：顺序与显示状态由后台「模块结构」决定 */}
            {visible.map((id, index) => (
              <ResumeSection
                key={id}
                title={sectionTitles.get(id) ?? id}
                last={index === visible.length - 1}
              >
                {blocks[id]}
              </ResumeSection>
            ))}
          </div>

          {resume.showPdfHint ? (
            <p className="mt-6 text-center font-cn text-[13px] leading-[1.8] text-[var(--color-ink-3)]">
              也可以发邮件到{' '}
              <a
                href={`mailto:${site.email}`}
                className="text-[var(--color-primary)] transition-opacity hover:opacity-80"
              >
                {site.email}
              </a>{' '}
              索取 PDF 版本。
            </p>
          ) : null}
        </Container>
      </section>
    </>
  )
}

interface ResumeSectionProps {
  title: string
  children: ReactNode
  last?: boolean
}

/** 履历正文不做复制：拦下右键菜单、复制事件与文本拖拽 */
function blockClipboard(event: SyntheticEvent) {
  event.preventDefault()
}

function ResumeSection({ title, children, last = false }: ResumeSectionProps) {
  return (
    <section
      className={[
        'py-8 select-none',
        last ? 'pb-0' : 'border-b border-[var(--color-line-soft)]',
      ].join(' ')}
      onContextMenu={blockClipboard}
      onCopy={blockClipboard}
      onCut={blockClipboard}
      onDragStart={blockClipboard}
    >
      <h3 className="mb-[18px] flex items-center gap-[10px] font-cn text-[17px] font-bold leading-none text-[var(--color-ink)]">
        <span className="block h-[16px] w-[3px] rounded-full bg-[var(--color-primary)]" />
        {title}
      </h3>
      {children}
    </section>
  )
}

interface BulletListProps {
  items: string[]
  className?: string
}

/** 简历里的条目列表：核心竞争力、工作经历、项目子块、教育证书共用同一套排版 */
function BulletList({ items, className = '' }: BulletListProps) {
  if (items.length === 0) return null
  return (
    <ul className={['flex flex-col gap-[8px]', className].filter(Boolean).join(' ')}>
      {items.map((item) => (
        <li key={item} className="flex items-start gap-[10px]">
          <span className="mt-[8px] block h-[5px] w-[5px] shrink-0 rounded-full bg-[var(--color-primary)]" />
          <span className="font-cn text-[14px] leading-[1.85] text-[var(--color-ink-2)]">{item}</span>
        </li>
      ))}
    </ul>
  )
}
