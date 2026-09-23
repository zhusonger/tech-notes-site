/**
 * 展示站的**类型**与**兜底默认值**。
 *
 * 数据归属：站点的内容以数据库为准，前台通过 `/api/content` 读取
 * （见 `server/content.mjs`）。本文件不再持有内容本身，只保留两样东西：
 *
 *   1. 类型定义 —— 接口响应与组件之间的契约；
 *   2. 兜底内容 —— 由 `shared/content.mjs`（建库种子的同一份源）经
 *      `presentContent()` 生成。接口不可用时前台显示它，并**明确提示**
 *      当前显示的不是线上内容（见 `SiteContentProvider`）。
 *
 * 这样兜底与线上走的是同一个呈现函数，结构上不可能对不上；
 * 而冒烟测试会断言「库内容与这份兜底一致」，防止种子改了兜底忘了改。
 *
 * 导航与页脚链接**不是内容**，是应用结构（它们指向真实路由），所以留在本文件里，
 * 不从数据库读 —— 让路由结构可编辑，等于把「点一下白屏」做成一个可配置项。
 */
import { content } from '../../shared/content.mjs'
import {
  featuredProjects as sharedFeaturedProjects,
  presentContent,
  presentPostDetail,
} from '../../shared/derive.mjs'

// --------------------------------------------------------------------- 类型
export interface NavItem {
  label: string
  to: string
}

export interface SiteInfo {
  brand: string
  tagline: string
  description: string
  author: string
  role: string
  location: string
  email: string
  github: string
  avatar: string
  logo: string
  footerQuote: string
  footerNote: string
  copyright: string
  seoTitle: string
  seoDescription: string
  seoKeywords: string
  ogImage: string
  siteUrl: string
}

export interface HeroSection {
  eyebrow: string
  name: string
  latin: string
  subline: string
  paragraph: string
  trust: string
  image: string
  primaryAction: NavItem
  secondaryAction: NavItem
  showImage: boolean
  showTrust: boolean
}

export interface ProfileInfo {
  name: string
  role: string
  location: string
  email: string
  bio: string
  avatar: string
}

export interface StatItem {
  value: string
  label: string
}

export interface ExperienceItem {
  date: string
  company: string
  role: string
  description: string
}

export interface EducationInfo {
  school: string
  major: string
  date: string
  cert: string
}

export interface TechItem {
  name: string
  sub: string
}

export interface AboutSection {
  profile: ProfileInfo
  skills: string[]
  skillsNote: string
  experience: ExperienceItem[]
  strengths: string[]
  stats: StatItem[]
}

export interface StackSection {
  items: TechItem[]
  note: string
}

export interface HomeContent {
  hero: HeroSection
  about: AboutSection
  stack: StackSection
  /** 教育背景是站点级事实，首页与简历页共用 */
  education: EducationInfo
}

export interface ResumeContactItem {
  icon: 'mail' | 'pin' | 'github'
  text: string
}

export interface ResumeSkillRow {
  label: string
  value: string
}

/** 工作经历下的项目子块：真实简历里项目是挂在公司下面的，不单独成节 */
export interface ResumeJobProject {
  name: string
  bullets: string[]
}

export interface ResumeJob {
  date: string
  title: string
  bullets: string[]
  projects?: ResumeJobProject[]
}

export interface ResumeContent {
  eyebrow: string
  title: string
  description: string
  header: { name: string; role: string; contacts: ResumeContactItem[] }
  summary: string
  highlights: string[]
  skills: ResumeSkillRow[]
  jobs: ResumeJob[]
  education: EducationInfo
  /** 底部「发邮件索取 PDF 版本」那句补充说明是否显示 */
  showPdfHint: boolean
  /**
   * 正文小节的渲染顺序与显示状态，由后台「模块结构」面板决定。
   *
   * 由 `shared/derive.mjs` 补齐成完整顺序后下发（认得的值就是
   * `shared/sections.mjs` 里 `RESUME_SECTIONS` 的 id），所以渲染时可以放心按下标取「末节」。
   */
  layout: { order: ResumeSectionId[]; hidden: ResumeSectionId[] }
}

/** 简历正文里可排序 / 可隐藏的小节 id。取值由 `shared/sections.mjs` 声明，这里只收口类型。 */
export type ResumeSectionId = string

export interface ProjectItem {
  id: string | number
  slug: string
  title: string
  description: string
  tags: string
  language: string
  /** 后台允许留空（校验只拦非 http(s)），库里可为 NULL，渲染前需判空 */
  repoUrl: string | null
  featured: boolean
}

export interface PostItem {
  id: string | number
  slug: string
  title: string
  category: string
  excerpt: string
  /** '2026.08.24' */
  dateLabel: string
  views: number
  /** '1.8k 阅读' */
  viewsLabel: string
  /** '约 8 分钟'；没有正文时为空串 */
  readingLabel: string
  image: string
}

export interface TocItem {
  label: string
  id: string
}

export interface ArticleBrief {
  slug: string
  title: string
  meta: string
}

export interface ArticleNavItem {
  label: string
  slug: string
  title: string
}

export interface PostDetail extends PostItem {
  body: string
  seoDescription: string
  tags: string[]
  breadcrumb: string[]
  toc: TocItem[]
  /** 更早发布的一篇；已是最旧时为 null */
  prev: ArticleNavItem | null
  /** 更晚发布的一篇；已是最新时为 null */
  next: ArticleNavItem | null
  related: ArticleBrief[]
  author: { name: string; role: string; bio: string; avatar: string }
}

export interface SiteContent {
  site: SiteInfo
  home: HomeContent
  resume: ResumeContent
  projects: ProjectItem[]
  posts: PostItem[]
  filters: { blog: string[]; projects: string[] }
  stats: { blog: string; projects: string }
}

// ------------------------------------------------------------- 路由结构常量
/** 顶部导航。指向真实路由/锚点，属于应用结构而非站点内容。 */
export const navItems: NavItem[] = [
  { label: '首页', to: '/' },
  { label: '关于我', to: '/#about' },
  { label: '技术栈', to: '/#stack' },
  { label: '项目', to: '/projects' },
  { label: '博客', to: '/blog' },
  { label: '联系', to: '/#contact' },
]

/**
 * 页脚链接分组。
 *
 * 只到「页面」「内容」两组：第三组「联系」由 Footer 用站点内容里的
 * GitHub 与邮箱实时拼出，写死在这里就会出现「站点设置改了、页脚还是旧的」。
 * 站外链接以 http(s) 开头，Footer 会渲染成新窗口打开的 `<a>`。
 */
export const footerLinkGroups: { label: string; links: NavItem[] }[] = [
  {
    label: '页面',
    links: [
      { label: '首页', to: '/' },
      { label: '关于我', to: '/#about' },
      { label: '技术栈', to: '/#stack' },
    ],
  },
  {
    label: '内容',
    links: [
      { label: '博客', to: '/blog' },
      { label: '项目', to: '/projects' },
      { label: '简历', to: '/resume' },
    ],
  },
]

/** 页脚底部的快捷入口。 */
export const footerBottomLinks: NavItem[] = [
  { label: '首页', to: '/' },
  { label: '关于我', to: '/#about' },
  { label: '博客', to: '/blog' },
  { label: '联系', to: '/#contact' },
]

// --------------------------------------------------------------- 兜底默认值
/**
 * 兜底内容：建库种子的同一份源，经同一个呈现函数得到。
 *
 * 它不是「示例数据」，而是**接口不可用时的降级显示** —— 因此必须与线上同形状，
 * 否则降级路径本身就带着 bug。类型断言是必要的：来源是 .mjs（服务端与浏览器共用），
 * 没有 TS 声明；字段是否缺失由冒烟测试里的一致性断言把守，而不是靠类型。
 */
export const DEFAULT_CONTENT = presentContent(content) as unknown as SiteContent

/** 兜底文章详情。只覆盖共享内容源里已有正文的文章，其余返回 null（走「未找到」）。 */
export function fallbackArticle(slug: string): PostDetail | null {
  return presentPostDetail(content, slug) as unknown as PostDetail | null
}

/**
 * 首页精选项目。
 *
 * 规则（标记优先、没有标记时按排序取前 n）写在 `shared/derive.mjs`，与接口同一份实现；
 * 这里只做类型收口 —— 共享模块是纯 JS，返回值会退化成 any。
 */
export function featuredProjects(projects: ProjectItem[], limit = 3): ProjectItem[] {
  return sharedFeaturedProjects(projects, limit) as ProjectItem[]
}
