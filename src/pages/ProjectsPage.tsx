import { useMemo, useState } from 'react'
import { Container } from '../components/Container'
import { PageHead } from '../components/PageHead'
import { ProjectCard } from '../components/ProjectCard'
import { useSiteContent } from '../data/SiteContent'

export default function ProjectsPage() {
  const { content } = useSiteContent()
  const { projects, filters, stats } = content
  const [activeFilter, setActiveFilter] = useState(filters.projects[0])

  const visibleProjects = useMemo(() => {
    if (activeFilter === filters.projects[0]) return projects
    return projects.filter((project) => project.language === activeFilter)
  }, [projects, filters, activeFilter])

  return (
    <>
      <PageHead
        eyebrow="全部作品"
        title="开源项目"
        description="从工具链到自托管，只做自己会长期使用的项目。"
        stats={stats.projects}
      />

      <section className="py-14 lg:py-16">
        <Container className="flex flex-col gap-10">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-[10px]">
              {filters.projects.map((filter) => {
                const active = filter === activeFilter
                return (
                  <button
                    key={filter}
                    type="button"
                    onClick={() => setActiveFilter(filter)}
                    className={[
                      'inline-flex items-center rounded-full px-[14px] py-[7px] font-cn text-[13px] leading-none transition-colors',
                      active
                        ? 'bg-[var(--color-primary)] text-white'
                        : 'border border-[var(--color-line)] bg-[var(--color-bg-warm)] text-[var(--color-ink-2)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]',
                    ].join(' ')}
                  >
                    {filter}
                  </button>
                )
              })}
            </div>
            {/*
              顺序由后台决定（精选优先，其次 sorting 权重）。这里不能写「按 stars 排序」——
              实际序列既不是按 stars 也不是按名称，写出来就是一句假话。
            */}
            <span className="font-cn text-[13px] leading-none text-[var(--color-ink-3)]">
              按精选顺序
            </span>
          </div>

          <div className="grid grid-cols-1 gap-[22px] sm:grid-cols-2 lg:grid-cols-3">
            {visibleProjects.map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}
          </div>
        </Container>
      </section>
    </>
  )
}
