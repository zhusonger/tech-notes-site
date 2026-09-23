#!/usr/bin/env node
/**
 * 本地静态服务器 —— 零依赖，只做一件事：把 dist/ 跑起来。
 *
 * 用法：node scripts/serve.mjs
 * 环境变量：PORT（默认 8080）、HOST（默认 127.0.0.1，仅本机可访问）
 *
 * 特性：
 * - SPA history 回退：/blog/reusable-skill 这类深链接直接命中 index.html，刷新不 404
 * - 带 hash 的构建产物走长缓存，index.html 走 no-cache（避免发新版本后浏览器仍用旧壳）
 * - 未命中且无扩展名的路径回退到 index.html；真的缺文件（.js/.png 等）老实返回 404
 * - /healthz 固定返回 200 ok，供容器健康检查使用（不参与 SPA 回退）
 */
import { createServer } from 'node:http'
import { createReadStream, existsSync, statSync } from 'node:fs'
import { extname, join, normalize, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('../dist', import.meta.url)))
const port = Number(process.env.PORT ?? 8080)
const host = process.env.HOST ?? '127.0.0.1'

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
}

if (!existsSync(join(root, 'index.html'))) {
  console.error(`[serve] 未找到构建产物：${root}\n[serve] 请先执行 npm run build`)
  process.exit(1)
}

/** 把 URL 路径解析成 dist 内的真实文件，做目录穿越防护。 */
function resolveFile(pathname) {
  const decoded = decodeURIComponent(pathname.split('?')[0])
  const target = normalize(join(root, decoded))
  if (target !== root && !target.startsWith(root + sep)) return null
  if (existsSync(target) && statSync(target).isFile()) return target
  const indexed = join(target, 'index.html')
  if (existsSync(indexed)) return indexed
  return null
}

const server = createServer((req, res) => {
  const pathname = (req.url ?? '/').split('?')[0]

  // 健康检查端点。必须是独立响应，不能落到下面的 SPA 回退 —— 否则只要 index.html
  // 还在磁盘上就永远返回 200，"健康检查"就失去了探测意义（页面坏了也照样通过）。
  if (pathname === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' })
    res.end('ok')
    return
  }

  const hasExtension = extname(pathname) !== ''

  let file = resolveFile(pathname)
  // SPA 回退：只有「无扩展名」的路径才回退成 index.html，
  // 这样真正缺失的静态资源仍然返回 404，不会把错误伪装成 200。
  if (!file && !hasExtension) file = join(root, 'index.html')
  if (!file) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('404 Not Found')
    console.log(`404 ${pathname}`)
    return
  }

  const isShell = file === join(root, 'index.html')
  const isHashed = pathname.startsWith('/assets/')
  res.writeHead(200, {
    'Content-Type': MIME[extname(file)] ?? 'application/octet-stream',
    'Cache-Control': isShell
      ? 'no-cache'
      : isHashed
        ? 'public, max-age=31536000, immutable'
        : 'public, max-age=3600',
  })
  createReadStream(file).pipe(res)
  console.log(`200 ${pathname}`)
})

server.listen(port, host, () => {
  console.log(`[serve] 站点已就绪 → http://${host}:${port}`)
  console.log(`[serve] 静态目录：${root}`)
  console.log('[serve] Ctrl+C 停止')
})
