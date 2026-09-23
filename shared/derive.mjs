/**
 * 内容派生与呈现 —— 服务端接口与前台兜底共用。
 *
 * 为什么服务端和前台要跑同一份代码：
 * 前台在接口不可用时用 `shared/content.mjs` 兜底，服务端用库里的数据。如果两边各自
 * 拼装「1.8k 阅读」「2026.08.24」这类展示串，就一定会有对不上的那一天，
 * 而且只在断网时才暴露。所以展示串只在这里生成一次，两边调用同一个函数。
 *
 * 这里全部是纯函数：不碰数据库、不碰 DOM、不依赖当前时间（除入参）。
 */

import { tocFromMarkdown } from './markdown.mjs'
import { RESUME_SECTION_IDS } from './sections.mjs'

const SHANGHAI = 'Asia/Shanghai'

/** 1800 → '1.8k'；486 → '486'。数值不到千位就直接显示，不补 '.0k'。 */
export function countLabel(n) {
  const value = Number(n) || 0
  if (value < 1000) return String(value)
  const k = value / 1000
  return `${k.toFixed(1).replace(/\.0$/, '')}k`
}

/**
 * ISO 串 → 'YYYY.MM.DD'。
 *
 * 时区固定用站点时区而不是运行环境时区：服务端在容器里是 UTC、浏览器是本地时区，
 * 同一条内容在两边显示出不同的日期（跨零点时差一天）是排查起来最费劲的那类问题。
 */
export function formatDate(iso) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: SHANGHAI,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d)
  const g = (t) => p.find((x) => x.type === t)?.value ?? ''
  return `${g('year')}.${g('month')}.${g('day')}`
}

/** ISO 串 → 'YYYY.MM'，用于「最后更新」这类只到月的口径。 */
export function formatMonth(iso) {
  const full = formatDate(iso)
  return full ? full.slice(0, 7) : ''
}

/**
 * 由正文派生阅读时长。
 *
 * 不单独存一列：存了就要在每次保存正文时同步，忘了同步就出现「改了正文、时长还是旧的」。
 * 中文按 400 字/分钟、西文按 200 词/分钟估算，取整后至少 1 分钟。
 */
export function readingMinutes(markdown) {
  const text = String(markdown ?? '')
  if (!text.trim()) return 0
  const cjk = (text.match(/[\u4e00-\u9fa5]/g) ?? []).length
  const latin = (text.replace(/[^\x00-\x7F]+/g, ' ').match(/[A-Za-z0-9][A-Za-z0-9'’._-]*/g) ?? []).length
  return Math.max(1, Math.round(cjk / 400 + latin / 200))
}

/** 阅读时长的展示串；没有正文时返回空串（调用方据此不显示这一段）。 */
export function readingLabel(markdown) {
  const minutes = readingMinutes(markdown)
  return minutes > 0 ? `约 ${minutes} 分钟` : ''
}

/*
 * 目录与正文渲染共用同一个解析器（`shared/markdown.mjs`），这里只做转发：
 * 目录锚点与正文标题的 id 必须由同一次解析产出，否则同名标题一有编号差异，
 * 点目录就会跳到别的标题上。
 */
export { headingId, parseMarkdown, tocFromMarkdown } from './markdown.mjs'

/** 已发布文章，按发布时间倒序（新→旧）。 */
export function publishedPosts(doc) {
  return (doc.posts ?? [])
    .filter((p) => (p.status ?? 'published') === 'published')
    .slice()
    .sort((a, b) => String(b.publishedAt ?? '').localeCompare(String(a.publishedAt ?? '')))
}

/** 单篇列表项（列表页 / 首页卡片用的展示串都在这里定型）。 */
export function presentPostListItem(post) {
  return {
    id: post.id ?? post.slug,
    slug: post.slug,
    title: post.title,
    category: post.category ?? '',
    excerpt: post.excerpt ?? '',
    dateLabel: formatDate(post.publishedAt),
    views: Number(post.views) || 0,
    viewsLabel: `${countLabel(post.views)} 阅读`,
    readingLabel: readingLabel(post.body),
    image: post.coverImage ?? '',
  }
}

/**
 * 上一篇 / 下一篇 / 相关文章。
 *
 * 语义按字面取：列表是「新→旧」，所以对某篇文章而言
 *   上一篇 = 比它早发布的（列表里的下一条）
 *   下一篇 = 比它晚发布的（列表里的上一条）
 * 处于两端时对应一侧为 null，前台就不渲染那一格 —— 宁可少一格，
 * 也不要拿一篇不相关的文章凑数。
 */
export function articleNav(posts, slug) {
  const index = posts.findIndex((p) => p.slug === slug)
  if (index < 0) return { prev: null, next: null, related: [] }
  const self = posts[index]
  const older = posts[index + 1] ?? null
  const newer = posts[index - 1] ?? null

  const brief = (p) => (p ? { slug: p.slug, title: p.title, meta: `${formatDate(p.publishedAt)} · ${countLabel(p.views)} 阅读` } : null)

  // 相关文章：同分类优先，不足两篇时用最近的其它文章补齐（不重复、不含自己）
  const rest = posts.filter((p) => p.slug !== slug)
  const sameCategory = rest.filter((p) => p.category && p.category === self.category)
  const picks = []
  for (const p of [...sameCategory, ...rest]) {
    if (picks.length >= 2) break
    if (picks.some((x) => x.slug === p.slug)) continue
    picks.push(p)
  }

  return {
    prev: older ? { label: '上一篇', slug: older.slug, title: older.title } : null,
    next: newer ? { label: '下一篇', slug: newer.slug, title: newer.title } : null,
    related: picks.map(brief).filter(Boolean),
  }
}

/** 联系方式：值取站点级事实，是否显示由简历区块决定，避免同一份邮箱存两处。 */
function contactsOf(settings, section) {
  const s = section ?? {}
  const out = []
  if (s.showEmail !== false) out.push({ icon: 'mail', text: settings.email ?? '' })
  if (s.showLocation !== false) out.push({ icon: 'pin', text: shortLocation(settings.location) })
  if (s.showGithub !== false) out.push({ icon: 'github', text: settings.github ?? '' })
  return out.filter((c) => c.text)
}

/** 简历抬头只写城市，不带省份 —— 与原简历的写法一致。 */
function shortLocation(location) {
  const text = String(location ?? '')
  return text.includes('·') ? text.split('·').pop().trim() : text
}

/**
 * 简历页正文的渲染顺序与显示状态。
 *
 * 库里没存、存了旧值、或存的内容不全时，一律**补齐**成完整顺序再下发 ——
 * 顺序表少一项，前台就会静默少渲染一节，而这属于最难查的一类「改了不生效」。
 * 认不出的 id 直接丢掉：宁可少一个未知模块，也不要让前台遇到不认识的 key。
 */
function resumeLayoutOf(sections) {
  const raw = sections.resumeLayout ?? {}
  const order = (Array.isArray(raw.order) ? raw.order : [])
    .filter((id) => RESUME_SECTION_IDS.includes(id))
  for (const id of RESUME_SECTION_IDS) if (!order.includes(id)) order.push(id)

  const hidden = (Array.isArray(raw.hidden) ? raw.hidden : [])
    .filter((id) => RESUME_SECTION_IDS.includes(id))

  return { order, hidden }
}

/**
 * 把内容文档呈现成接口响应 / 前台兜底内容。
 *
 * 入参是「内容文档」（`shared/content.mjs` 的结构）：
 * 服务端从库里拼出同形状的文档再调用它，所以线上内容与兜底内容结构必然一致。
 */
export function presentContent(doc) {
  const settings = doc.settings ?? {}
  const sections = doc.sections ?? {}
  const hero = sections.hero ?? {}
  const about = sections.about ?? {}
  const stack = sections.stack ?? {}
  const resumeSummary = sections.resumeSummary ?? {}
  const resumeExperience = sections.resumeExperience ?? {}
  const resumeSkills = sections.resumeSkills ?? {}
  const resumeContact = sections.resumeContact ?? {}

  const posts = publishedPosts(doc)
  const projects = (doc.projects ?? [])
    .filter((p) => (p.status ?? 'published') === 'published')
    .slice()
    .sort((a, b) => {
      const fa = a.featured ? 0 : 1
      const fb = b.featured ? 0 : 1
      if (fa !== fb) return fa - fb
      return (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0)
    })

  const categoryNames = (doc.categories ?? []).map((c) => (typeof c === 'string' ? c : c.name)).filter(Boolean)

  const languages = []
  for (const p of projects) {
    if (!p.language) continue
    if (!languages.includes(p.language)) languages.push(p.language)
  }
  const languageRank = languages
    .map((name) => ({ name, count: projects.filter((p) => p.language === name).length }))
    .sort((a, b) => b.count - a.count)
    .map((x) => x.name)

  const lastPost = posts[0]

  return {
    site: {
      brand: settings.brand ?? '',
      tagline: settings.tagline ?? '',
      description: settings.description ?? '',
      author: settings.author ?? '',
      role: settings.role ?? '',
      location: settings.location ?? '',
      email: settings.email ?? '',
      github: settings.github ?? '',
      avatar: settings.avatar ?? '',
      logo: settings.logo ?? '',
      footerQuote: settings.footerQuote ?? '',
      footerNote: settings.footerNote ?? '',
      copyright: settings.copyright ?? '',
      seoTitle: settings.seoTitle ?? '',
      seoDescription: settings.seoDescription ?? '',
      seoKeywords: settings.seoKeywords ?? '',
      ogImage: settings.ogImage ?? '',
      siteUrl: settings.siteUrl ?? '',
    },
    home: {
      hero,
      about: {
        // 名片由站点级事实派生：与文章作者卡同源，不存在两处写法不一致
        profile: {
          name: settings.author ?? '',
          role: settings.role ?? '',
          location: settings.location ?? '',
          email: settings.email ?? '',
          bio: settings.bio ?? '',
          avatar: settings.avatar ?? '',
        },
        skills: about.skills ?? [],
        skillsNote: about.skillsNote ?? '',
        experience: about.experience ?? [],
        strengths: about.strengths ?? [],
        stats: about.stats ?? [],
      },
      stack: { items: stack.items ?? [], note: stack.note ?? '' },
      // 教育背景来自站点级事实：首页与简历页共用一份，不存在两处不一致
      education: {
        school: settings.educationSchool ?? '',
        major: settings.educationMajor ?? '',
        date: settings.educationDate ?? '',
        cert: settings.educationCert ?? '',
      },
    },
    resume: {
      eyebrow: resumeSummary.eyebrow ?? '',
      title: resumeSummary.title ?? '',
      description: resumeSummary.description ?? '',
      header: {
        name: settings.author ?? '',
        role: settings.role ?? '',
        contacts: contactsOf(settings, resumeContact),
      },
      summary: resumeSummary.summary ?? '',
      highlights: resumeSummary.highlights ?? [],
      skills: resumeSkills.rows ?? [],
      jobs: resumeExperience.jobs ?? [],
      education: {
        school: settings.educationSchool ?? '',
        major: settings.educationMajor ?? '',
        date: settings.educationDate ?? '',
        cert: settings.educationCert ?? '',
      },
      showPdfHint: resumeContact.pdfHint !== false,
      layout: resumeLayoutOf(sections),
    },
    projects: projects.map((p) => ({
      id: p.id ?? p.slug,
      slug: p.slug,
      title: p.title,
      description: p.description ?? '',
      tags: p.tags ?? '',
      language: p.language ?? '',
      repoUrl: p.repoUrl ?? '',
      featured: Boolean(p.featured),
    })),
    posts: posts.map(presentPostListItem),
    filters: {
      blog: ['全部', ...categoryNames],
      projects: ['全部', ...languageRank],
    },
    stats: {
      blog: `${posts.length} 篇文章 · ${categoryNames.length} 个分类${lastPost ? ` · 最后更新 ${formatMonth(lastPost.publishedAt)}` : ''}`,
      projects: `${projects.length} 个项目${
        languageRank.length ? ` · 主要语言 ${languageRank.slice(0, 2).join(' / ')}` : ''
      }`,
    },
  }
}

/** 文章详情。找不到（或不是已发布状态）时返回 null，由调用方决定 404。 */
export function presentPostDetail(doc, slug) {
  const posts = publishedPosts(doc)
  const post = posts.find((p) => p.slug === slug)
  if (!post) return null

  const settings = doc.settings ?? {}
  const nav = articleNav(posts, slug)

  return {
    ...presentPostListItem(post),
    body: post.body ?? '',
    seoDescription: post.seoDescription ?? '',
    tags: post.tags ?? [],
    breadcrumb: ['首页', '博客', post.category || '未分类'],
    toc: tocFromMarkdown(post.body),
    prev: nav.prev,
    next: nav.next,
    related: nav.related,
    author: {
      name: settings.author ?? '',
      role: settings.role ?? '',
      bio: settings.bio ?? '',
      avatar: settings.avatar ?? '',
    },
  }
}

/** 首页精选项目：取不到 featured 时退化为按排序取前 n 个，首页不会空一块。 */
export function featuredProjects(projects, limit = 3) {
  const featured = projects.filter((p) => p.featured)
  return (featured.length > 0 ? featured : projects).slice(0, limit)
}
