import { Link } from 'react-router-dom'
import { ArticleCard } from '../components/ArticleCard'
import { ButtonLink, TextLink } from '../components/Button'
import { Container } from '../components/Container'
import { ChevronRightIcon, MailIcon, PinIcon, techIcon } from '../components/Icons'
import { ProjectCard } from '../components/ProjectCard'
import { SectionHeader } from '../components/SectionHeader'
import { useSiteContent } from '../data/SiteContent'
import { featuredProjects } from '../data/site'

export default function HomePage() {
  const { content } = useSiteContent()
  const { hero, about, stack, education } = content.home
  const featured = featuredProjects(content.projects, 3)
  const latest = content.posts.slice(0, 3)

  return (
    <>
      {/* Hero */}
      <section className="border-b border-[var(--color-line)] bg-[var(--color-bg-warm)]">
        <Container
          className={[
            'grid grid-cols-1 items-center gap-12 py-16 lg:gap-16 lg:py-20',
            // 关掉配图后收成单列：留着空列会在右侧留一道空白，比不放图更难看
            hero.showImage ? 'lg:grid-cols-[1.05fr_0.95fr]' : '',
          ].join(' ')}
        >
          <div className="flex flex-col gap-6">
            <span className="font-cn text-[14px] leading-none text-[var(--color-ink-3)]">
              {hero.eyebrow}
            </span>
            <h1 className="flex flex-wrap items-baseline gap-x-[14px] gap-y-2">
              <span className="font-cn text-[40px] font-bold leading-[1.1] text-[var(--color-ink)] md:text-[52px]">
                {hero.name}
              </span>
              <span className="font-latin text-[32px] font-bold leading-[1.1] text-[var(--color-ink-3)] md:text-[40px]">
                {hero.latin}
              </span>
            </h1>
            <p className="font-cn text-[18px] font-medium leading-[1.6] text-[var(--color-primary)]">
              {hero.subline}
            </p>
            <p className="max-w-[540px] font-cn text-[15px] leading-[1.9] text-[var(--color-ink-2)]">
              {hero.paragraph}
            </p>
            {hero.showTrust && hero.trust ? (
              <p className="font-cn text-[13px] leading-[1.8] text-[var(--color-ink-3)]">
                {hero.trust}
              </p>
            ) : null}
            <div className="flex flex-wrap items-center gap-[12px] pt-[6px]">
              <ButtonLink to={hero.primaryAction.to} variant="primary">
                {hero.primaryAction.label}
              </ButtonLink>
              <ButtonLink to={hero.secondaryAction.to} variant="outline">
                {hero.secondaryAction.label}
              </ButtonLink>
            </div>
          </div>

          {hero.showImage && hero.image ? (
            <div className="overflow-hidden rounded-[20px] border border-[var(--color-line)] bg-[var(--color-bg)]">
              <img
                src={hero.image}
                alt="工作台"
                className="h-[280px] w-full object-cover md:h-[400px]"
              />
            </div>
          ) : null}
        </Container>
      </section>

      {/* 关于我 */}
      <section id="about" className="scroll-mt-[92px] border-b border-[var(--color-line)] py-16 lg:py-20">
        <Container>
          <SectionHeader
            title="关于我"
            latin="/ About"
            action={<TextLink to="/resume">完整简历</TextLink>}
          />

          <div className="mt-10 grid grid-cols-1 gap-[20px] rounded-[18px] border border-[var(--color-line)] bg-[var(--color-bg-warm)] p-[24px] lg:grid-cols-4 lg:p-[30px]">
            {/* 个人名片 */}
            <div className="flex flex-col gap-[16px] lg:border-r lg:border-[var(--color-line)] lg:pr-[24px]">
              <img
                src={about.profile.avatar}
                alt={about.profile.name}
                className="h-[84px] w-[84px] rounded-[16px] object-cover"
              />
              <div className="flex flex-col gap-[8px]">
                <span className="font-cn text-[18px] font-bold leading-none text-[var(--color-ink)]">
                  {about.profile.name}
                </span>
                <span className="font-cn text-[13px] leading-[1.6] text-[var(--color-primary)]">
                  {about.profile.role}
                </span>
              </div>
              <div className="flex flex-col gap-[8px]">
                <span className="inline-flex items-center gap-[8px] font-cn text-[13px] leading-none text-[var(--color-ink-2)]">
                  <PinIcon className="h-[15px] w-[15px] text-[var(--color-ink-3)]" />
                  {about.profile.location}
                </span>
                <a
                  href={`mailto:${about.profile.email}`}
                  className="inline-flex items-center gap-[8px] font-latin text-[13px] leading-none text-[var(--color-ink-2)] transition-colors hover:text-[var(--color-primary)]"
                >
                  <MailIcon className="h-[15px] w-[15px] text-[var(--color-ink-3)]" />
                  {about.profile.email}
                </a>
              </div>
              <p className="font-cn text-[13px] leading-[1.8] text-[var(--color-ink-2)]">
                {about.profile.bio}
              </p>
            </div>

            {/* 专业技能 */}
            <div className="flex flex-col gap-[16px] lg:border-r lg:border-[var(--color-line)] lg:px-[24px]">
              <div className="flex items-baseline gap-[8px]">
                <h3 className="font-cn text-[16px] font-bold leading-none text-[var(--color-ink)]">
                  专业技能
                </h3>
                <span className="font-latin text-[12px] leading-none text-[var(--color-ink-3)]">
                  / Skills
                </span>
              </div>
              <div className="flex flex-wrap gap-[8px]">
                {about.skills.map((skill) => (
                  <span
                    key={skill}
                    className="rounded-full border border-[var(--color-line)] bg-[var(--color-bg)] px-[12px] py-[6px] font-latin text-[12px] leading-none text-[var(--color-ink-2)]"
                  >
                    {skill}
                  </span>
                ))}
              </div>
              <p className="font-cn text-[12px] leading-[1.8] text-[var(--color-ink-3)]">
                {about.skillsNote}
              </p>
            </div>

            {/* 工作经历 */}
            <div className="flex flex-col gap-[18px] lg:border-r lg:border-[var(--color-line)] lg:px-[24px]">
              <div className="flex items-baseline gap-[8px]">
                <h3 className="font-cn text-[16px] font-bold leading-none text-[var(--color-ink)]">
                  工作经历
                </h3>
                <span className="font-latin text-[12px] leading-none text-[var(--color-ink-3)]">
                  / Experience
                </span>
              </div>
              <ul className="flex flex-col gap-[18px]">
                {about.experience.map((item) => (
                  <li key={item.company} className="flex flex-col gap-[6px]">
                    <span className="font-latin text-[12px] leading-none text-[var(--color-ink-3)]">
                      {item.date}
                    </span>
                    <span className="font-cn text-[14px] font-medium leading-none text-[var(--color-ink)]">
                      {item.company}
                    </span>
                    <span className="font-cn text-[12px] leading-[1.6] text-[var(--color-primary)]">
                      {item.role}
                    </span>
                    <p className="font-cn text-[12px] leading-[1.8] text-[var(--color-ink-2)]">
                      {item.description}
                    </p>
                  </li>
                ))}
              </ul>
            </div>

            {/* 教育背景 + 个人优势 */}
            <div className="flex flex-col gap-[18px] lg:pl-[24px]">
              <div className="flex items-baseline gap-[8px]">
                <h3 className="font-cn text-[16px] font-bold leading-none text-[var(--color-ink)]">
                  教育背景
                </h3>
                <span className="font-latin text-[12px] leading-none text-[var(--color-ink-3)]">
                  / Education
                </span>
              </div>
              <div className="flex flex-col gap-[6px]">
                <span className="font-cn text-[14px] font-medium leading-none text-[var(--color-ink)]">
                  {education.school}
                </span>
                <span className="font-cn text-[12px] leading-none text-[var(--color-ink-2)]">
                  {education.major}
                </span>
                <span className="font-latin text-[12px] leading-none text-[var(--color-ink-3)]">
                  {education.date}
                </span>
              </div>

              <div className="flex items-baseline gap-[8px] pt-[6px]">
                <h3 className="font-cn text-[16px] font-bold leading-none text-[var(--color-ink)]">
                  个人优势
                </h3>
                <span className="font-latin text-[12px] leading-none text-[var(--color-ink-3)]">
                  / Strengths
                </span>
              </div>
              <ul className="flex flex-col gap-[10px]">
                {about.strengths.map((item) => (
                  <li key={item} className="flex items-start gap-[8px]">
                    <ChevronRightIcon className="mt-[3px] h-[14px] w-[14px] shrink-0 text-[var(--color-primary)]" />
                    <span className="font-cn text-[12px] leading-[1.7] text-[var(--color-ink-2)]">
                      {item}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* 数据条 */}
          <div className="mt-[20px] grid grid-cols-2 gap-[16px] rounded-[18px] border border-[var(--color-line)] bg-[var(--color-bg)] px-[24px] py-[26px] md:grid-cols-4 lg:px-[30px]">
            {about.stats.map((stat) => (
              <div key={stat.label} className="flex flex-col items-center gap-[8px]">
                <span className="font-latin text-[30px] font-bold leading-none text-[var(--color-primary)]">
                  {stat.value}
                </span>
                <span className="font-cn text-[13px] leading-none text-[var(--color-ink-2)]">
                  {stat.label}
                </span>
              </div>
            ))}
          </div>
        </Container>
      </section>

      {/* 技术栈 */}
      <section id="stack" className="scroll-mt-[92px] border-b border-[var(--color-line)] py-16 lg:py-20">
        <Container>
          <SectionHeader
            title="技术栈"
            latin="/ Tech Stack"
            action={<span className="font-cn text-[13px] text-[var(--color-ink-3)]">{stack.note}</span>}
          />
          <div className="mt-10 grid grid-cols-2 gap-[14px] sm:grid-cols-3 lg:grid-cols-5">
            {stack.items.map((tech) => {
              const Icon = techIcon(tech.name)
              return (
                <div
                  key={tech.name}
                  className="flex flex-col gap-[14px] rounded-[14px] border border-[var(--color-line)] bg-[var(--color-bg-warm)] p-[18px] transition-colors hover:border-[var(--color-primary)]"
                >
                  <span className="flex h-[38px] w-[38px] items-center justify-center rounded-[10px] bg-[var(--color-primary-soft)] text-[var(--color-primary)]">
                    <Icon className="h-[19px] w-[19px]" />
                  </span>
                  <div className="flex flex-col gap-[6px]">
                    <span className="font-latin text-[15px] font-medium leading-none text-[var(--color-ink)]">
                      {tech.name}
                    </span>
                    <span className="font-cn text-[12px] leading-none text-[var(--color-ink-3)]">
                      {tech.sub}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </Container>
      </section>

      {/* 精选项目 + 最新博客 */}
      <section className="py-16 lg:py-20">
        <Container className="grid grid-cols-1 gap-14 lg:grid-cols-2 lg:gap-16">
          <div className="flex flex-col gap-[22px]">
            <SectionHeader title="精选项目" latin="/ Projects" action={<TextLink to="/projects">全部项目</TextLink>} />
            <div className="flex flex-col gap-[14px]">
              {featured.map((project, index) => (
                <div key={project.id} className={index < 2 ? '' : 'hidden lg:block'}>
                  <ProjectCard project={project} variant="compact" />
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-[22px]">
            <SectionHeader title="最新博客" latin="/ Latest" action={<TextLink to="/blog">查看全部</TextLink>} />
            <div className="flex flex-col gap-[14px]">
              {latest.map((post, index) => (
                <div key={post.id} className={index < 2 ? '' : 'hidden lg:block'}>
                  <ArticleCard post={post} layout="row" />
                </div>
              ))}
            </div>
          </div>
        </Container>
      </section>

      {/* 联系引导 */}
      <section className="border-t border-[var(--color-line)] bg-[var(--color-bg-warm)] py-14">
        <Container className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
          <div className="flex flex-col gap-[10px]">
            <h2 className="font-cn text-[22px] font-bold leading-none text-[var(--color-ink)]">
              有想法，欢迎来信
            </h2>
            <p className="font-cn text-[14px] leading-[1.8] text-[var(--color-ink-2)]">
              工具链、自托管、前端工程，或者只是想聊聊实现细节。
            </p>
          </div>
          <Link
            to="/#contact"
            className="inline-flex h-[46px] items-center rounded-full bg-[var(--color-primary)] px-[24px] font-cn text-[14px] font-medium leading-none text-white transition-colors hover:bg-[var(--color-primary-deep)]"
          >
            与我联系
          </Link>
        </Container>
      </section>
    </>
  )
}
