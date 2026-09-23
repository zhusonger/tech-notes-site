/**
 * 展示站内容接口 —— 前台唯一的数据来源。
 *
 * 与 `/api/admin/*` 的区别：
 *   - 不需要登录。它是给访客看的，鉴权只保护「能改什么」，不保护「能看什么」；
 *   - 只出已发布内容。草稿与回收站在这里一律查不到，不是靠前端过滤 ——
 *     把未发布内容发给浏览器再藏起来，等于已经泄露了。
 *
 * 响应里没有任何库内细节（列名、内部 id 之外的字段、审计信息），
 * 拼装交给 `shared/derive.mjs`：展示串（'1.8k 阅读'、'2026.08.24'）只在那里生成一次，
 * 前台兜底走同一个函数，所以断网时看到的内容与线上结构完全一致。
 */
import express from 'express'
import rateLimit from 'express-rate-limit'
import { all, nowIso, readSections, readSettingsMap } from './db.mjs'
import { presentContent, presentPostDetail } from '../shared/derive.mjs'

export const contentApi = express.Router()

/*
 * 内容接口是匿名的，给一个宽松的上限即可：正常浏览一次页面只发一两个请求，
 * 600 次/5 分钟足够用，同时挡掉脚本刷取。
 */
const contentLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 600,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: '请求过于频繁，请稍后再试' },
})

/**
 * 从库里拼出「内容文档」，形状与 `shared/content.mjs` 一致。
 *
 * 媒体库不在其中：前台不用它，每次请求白查一张表没有意义。
 * 它属于后台的媒体管理屏，那时再单独取。
 */
export function readContentDoc() {
  const settings = readSettingsMap()
  const sections = readSections()

  const categories = all(
    'SELECT name, slug, description, sort_order FROM categories ORDER BY sort_order, id'
  ).map((r) => ({ name: r.name, slug: r.slug, description: r.description, sortOrder: r.sort_order }))

  const tags = all('SELECT name, slug FROM tags ORDER BY name').map((r) => ({ name: r.name, slug: r.slug }))

  const tagRows = all('SELECT post_id, tag_id FROM post_tags')
  const tagNameById = new Map(all('SELECT id, name FROM tags').map((t) => [t.id, t.name]))
  const tagsByPost = new Map()
  for (const row of tagRows) {
    const name = tagNameById.get(row.tag_id)
    if (!name) continue
    if (!tagsByPost.has(row.post_id)) tagsByPost.set(row.post_id, [])
    tagsByPost.get(row.post_id).push(name)
  }

  const posts = all(
    `SELECT id, slug, title, category, excerpt, body, status, views, cover_image,
            seo_description, published_at
     FROM posts`
  ).map((r) => ({
    id: r.id,
    slug: r.slug,
    title: r.title,
    category: r.category,
    excerpt: r.excerpt,
    body: r.body,
    status: r.status,
    views: r.views,
    coverImage: r.cover_image,
    seoDescription: r.seo_description,
    publishedAt: r.published_at,
    tags: tagsByPost.get(r.id) ?? [],
  }))

  const projects = all(
    `SELECT id, slug, title, description, tags, language, repo_url, featured, status, sort_order
     FROM projects`
  ).map((r) => ({
    id: r.id,
    slug: r.slug,
    title: r.title,
    description: r.description,
    tags: r.tags,
    language: r.language,
    repoUrl: r.repo_url,
    featured: Boolean(r.featured),
    status: r.status,
    sortOrder: r.sort_order,
  }))

  return { settings, sections, categories, tags, posts, projects }
}

/** 内容会随后台编辑立刻变化，不能被中间层（Cloudflare 等）缓存住。 */
const noStore = (res) => res.set('Cache-Control', 'no-store')

/** 整站内容。页面外壳与列表页的数据一次取完，避免首屏并发多个请求。 */
contentApi.get('/content', contentLimiter, (_req, res) => {
  noStore(res)
  res.json({ ...presentContent(readContentDoc()), generatedAt: nowIso() })
})

/**
 * 后台外壳需要的站点标识。
 *
 * 为什么单独开一个端点：后台侧边栏与登录页每次渲染都要显示站点名称，而它来自
 * 数据库（属可编辑的站点设置）。让外壳去拉 `/content` —— 那份响应带着全部文章正文
 * 与区块文档 —— 等于为了一个字段下载几十 KB。这里只出外壳真正会用的东西。
 *
 * 与 `/content` 同级公开：站点名称本来就显示在首页上，不需要鉴权。
 */
contentApi.get('/content/site', contentLimiter, (_req, res) => {
  noStore(res)
  const settings = readSettingsMap()
  res.json({ brand: settings.brand ?? '' })
})

/**
 * 单篇正文。
 *
 * 单独一个端点而不是把全部正文塞进 `/content`：正文是唯一会持续变大的字段，
 * 列表页不需要它。文章页也只需要这一篇。
 */
contentApi.get('/content/posts/:slug', contentLimiter, (req, res) => {
  noStore(res)
  const detail = presentPostDetail(readContentDoc(), String(req.params.slug))
  if (!detail) return res.status(404).json({ error: '文章不存在' })
  res.json(detail)
})
