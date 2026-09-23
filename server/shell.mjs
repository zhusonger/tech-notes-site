/**
 * 页面外壳（`dist/index.html`）的 SEO 注入。
 *
 * 为什么必须在**服务端**替换，而不是交给客户端：
 * `<title>` 与 `<meta name="description">` 是爬虫与社交平台分享卡片**唯一**会读的东西 ——
 * 它们都不执行 JS。写死在 index.html 里意味着后台改了站点名称，搜索结果与分享卡片
 * 还挂着旧文案，而页面本身看起来一切正常，没人会发现。
 *
 * index.html 里只留**中性默认值**（构建产物单独打开也不露任何信息），真正的文案在这里
 * 按 `site_settings` 替换。用「替换既有内容」而不是「模板占位符」：
 * 万一某天 HTML 结构改了导致替换没命中，页面退化成中性默认值；
 * 用占位符的话，露在页面上的会是一个 `{{SITE_TITLE}}`。
 */
import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { distDir, getSetting } from './db.mjs'
import { escapeHtml } from './html.mjs'

const SHELL = join(distDir, 'index.html')

/*
 * 模板缓存。构建产物在进程存活期间不会变，但本机开发时 `npm run build`
 * 之后未必重启服务 —— 所以按 mtime 失效，而不是只读一次。
 *
 * 缓存的是**模板**，不是渲染结果：每次请求仍按当前设置重新替换，
 * 后台改完标题立刻生效。
 */
let cached = { mtime: -1, html: '' }

function shellTemplate() {
  let mtime
  try {
    mtime = statSync(SHELL).mtimeMs
  } catch {
    return '' // 未构建
  }
  if (cached.mtime !== mtime) {
    try {
      cached = { mtime, html: readFileSync(SHELL, 'utf8') }
    } catch {
      return '' // 读不动：调用方退回静态读取
    }
  }
  return cached.html
}

/**
 * 渲染页面外壳（已注入库里的 SEO 文案）。
 *
 * @returns {string} 完整 HTML；返回空串表示外壳不可用，调用方应退回静态读取，
 *   不要把「渲染失败」升级成 500 —— 页面上少一句正确标题，比直接打不开轻得多。
 */
export function renderShell() {
  const html = shellTemplate()
  if (!html) return ''

  const brand = getSetting('brand', 'Tech Notes')
  const title = getSetting('seoTitle', '') || brand
  const description = getSetting('seoDescription', '') || getSetting('description', '')

  return html
    .replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeHtml(title)}</title>`)
    .replace(
      /(<meta\s+name="description"\s+content=")[^"]*(")/i,
      (_match, open, close) => `${open}${escapeHtml(description)}${close}`
    )
}
