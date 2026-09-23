/**
 * 应用服务端 —— 一个进程同时提供：后台 API、展示站静态资源、/healthz。
 *
 * 为什么把静态服务收进 Express（替换原先零依赖的 scripts/serve.mjs）：
 * 后台与前台同源，才能用 httpOnly Cookie 承载会话、也不必再配一套 CORS 与域名。
 * 代价是运行镜像需要带 node_modules，并挂一个可写卷存 SQLite —— 这是做真后台的必要成本。
 *
 * 静态服务仍沿用 serve.mjs 的三条硬规则（不放宽），另加两条为后台服务：
 *   1. 只有「无扩展名」的路径才回退 index.html，缺资源一律 404，不把错误伪装成 200；
 *   2. index.html 走 no-cache，/assets/* 走 immutable 长缓存；
 *   3. 目录穿越防护：解析后必须仍在 dist 内；
 *   4. /api/* 不参与静态回退 —— 未匹配的接口路径必须返回 JSON 404，
 *      否则「路径写错」会退化成 200 + 一坨 HTML；
 *   5. 维护模式只替换「页面外壳」，不影响静态资源与后台 —— 见下方中间件的注释。
 */
import express from 'express'
import helmet from 'helmet'
import { createReadStream, existsSync, statSync } from 'node:fs'
import { extname, join, normalize, sep } from 'node:path'
import { api } from './api.mjs'
import { contentApi } from './content.mjs'
import { pruneAuditLogs } from './audit.mjs'
/* 页面外壳的 SEO 注入：title / description 必须来自数据库，不能写死在 index.html —— 见该文件注释 */
import { renderShell } from './shell.mjs'
import {
  attachSession,
  hashPassword,
  privacyHash,
  pruneExpired,
  writeAudit,
} from './auth.mjs'
import {
  distDir,
  get,
  getSetting,
  nowIso,
  pruneVisitorLogs,
  recordPageView,
  recordVisit,
  run,
  seedIfEmpty,
} from './db.mjs'
import { UPLOAD_DIR } from './media.mjs'
import { maintenancePage } from './maintenance.mjs'

const PORT = Number(process.env.PORT ?? 18007)
const HOST = process.env.HOST ?? '127.0.0.1'
const DIST = distDir

// ---------------------------------------------------------------- 首次启动引导
async function bootstrapAdmin() {
  const existing = get('SELECT COUNT(*) AS n FROM users')?.n ?? 0
  if (existing > 0) return

  /*
   * 初始管理员的邮箱与显示名都从环境变量读，默认值选**明显不可达**的占位。
   *
   * 为什么不能给一个像真的默认邮箱：早先这里默认是一个真实邮箱，于是任何一次
   * 「忘了设 ADMIN_EMAIL」的部署都会静默把那个邮箱注册成超级管理员 ——
   * 密码是随机生成的、没人知道，但账号确实存在，而且绑在别人的邮箱上。
   * 换成人人一眼看得出是占位的 example.com，忘了配也能自己发现。
   */
  const email = (process.env.ADMIN_EMAIL ?? 'admin@example.com').trim().toLowerCase()
  const displayName = (process.env.ADMIN_NAME ?? '管理员').trim() || '管理员'
  const provided = process.env.ADMIN_PASSWORD
  // 没有显式给密码时生成一个强随机密码，**只在首次启动打印一次**。
  // 之后必须由管理员在「账号设置」里修改（must_change_password 置 1）。
  const password = provided ?? `tn-${privacyHash(email).slice(0, 10)}-${Date.now().toString(36)}`
  const { hash, salt } = await hashPassword(password)
  const ts = nowIso()
  run(
    `INSERT INTO users (email, display_name, role, password_hash, password_salt, must_change_password, created_at, updated_at)
     VALUES (?, ?, 'super_admin', ?, ?, ?, ?, ?)`,
    email,
    displayName,
    hash,
    salt,
    provided ? 0 : 1,
    ts,
    ts
  )
  writeAudit({ actor: 'system', action: 'bootstrap_admin', detail: `创建初始管理员 ${email}` })

  console.log('[bootstrap] 已创建初始管理员账号')
  console.log(`[bootstrap]   邮箱：${email}`)
  if (!provided) {
    console.log(`[bootstrap]   初始密码：${password}`)
    console.log('[bootstrap]   该密码仅本次打印，登录后请立即在「账号设置 → 修改密码」中更换')
  }
}

/*
 * 内容初始化：把 `shared/content.mjs` 的种子灌进空库。
 *
 * 两处调用：
 *   1. 服务启动（这里）—— 正常路径，容器起来内容就绪；
 *   2. 请求路径兜底（见下方中间件）—— 覆盖「服务先起来、库随后才就绪」的场景。
 *
 * 幂等由 `seedIfEmpty()` 保证：它只在各表为空时写入，绝不覆盖后台改过的内容。
 * 内存标记的作用是不让每个请求都跑七次 COUNT —— 确认过一次就不再进这条路。
 */
let seedChecked = false

function ensureSeeded(trigger) {
  if (seedChecked) return
  const seeded = seedIfEmpty()
  seedChecked = true
  if (Object.values(seeded).some((n) => n > 0)) {
    console.log(`[seed] 已写入初始内容（${trigger}）:`, JSON.stringify(seeded))
  }
}

ensureSeeded('启动')
await bootstrapAdmin()

// ---------------------------------------------------------------- 应用装配
const app = express()
// 生产由 nginx / Cloudflare 反代，若不信任代理头则 req.ip 全是 127.0.0.1，限流会误伤
app.set('trust proxy', process.env.TRUST_PROXY ?? 1)
app.disable('x-powered-by')

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        // Google Fonts 的样式表 + React 内联样式
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
        // 二维码是 data URL，头像与配图同源
        imgSrc: ["'self'", 'data:', 'blob:'],
        scriptSrc: ["'self'"],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        frameAncestors: ["'none'"],
      },
    },
    // 站点外层套了 Cloudflare，HSTS 由边缘下发，这里不重复声明
    hsts: false,
    crossOriginEmbedderPolicy: false,
  })
)

/*
 * 首次访问兜底初始化。
 *
 * 只覆盖一种场景：服务先起来、数据库随后才就绪（容器先启动、数据卷后挂载）。
 * 没有这一层的话，访客会先看到一个空站点，重启一次又好了 —— 这种「时好时坏」
 * 是最难排查的一类问题。
 *
 * 放在所有路由之前、且不带任何条件：`ensureSeeded()` 自己用内存标记短路，
 * 确认过内容存在之后这里只是一次布尔判断。
 */
app.use((_req, _res, next) => {
  ensureSeeded('首次访问')
  next()
})

app.use(express.json({ limit: '32kb' }))

// 极简 cookie 解析：只为读一个会话 Cookie，不值得再引一个依赖
app.use((req, _res, next) => {
  const header = req.headers.cookie
  req.cookies = {}
  if (header) {
    for (const part of String(header).split(';')) {
      const idx = part.indexOf('=')
      if (idx < 0) continue
      req.cookies[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim())
    }
  }
  next()
})

// CSRF 防护：会话走 Cookie，因此对写方法强制校验 Origin 与 Host 同源。
// 同源请求一定带 Origin/Referer；两者都缺失时（如 curl）放行 —— 那种情况下
// 攻击者已经能直连服务，Cookie 也拿不到，CSRF 模型不成立。
app.use((req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next()
  const origin = req.get('origin')
  if (!origin) return next()
  let originHost
  try {
    originHost = new URL(origin).host
  } catch {
    return res.status(403).json({ error: '请求来源不合法' })
  }
  if (originHost !== req.get('host')) {
    return res.status(403).json({ error: '请求来源不合法' })
  }
  next()
})

// 会话解析必须排在 API 之前：requireAuth 依赖这里写好的 req.user
app.use(attachSession)

// 展示站内容（匿名）与后台接口（需登录）挂同一个前缀，但各自成模块：
// 前者的读者是访客，后者的读者是管理员，鉴权与缓存口径都不一样。
app.use('/api', contentApi)
app.use('/api', api)

/**
 * 上传的媒体。
 *
 * 单独挂而不并进 dist 的静态服务，有两个原因：
 *   - 上传目录是运行时可写的卷，不属于构建产物（镜像重建不会带上它，也不该带）；
 *   - 它不是 SPA 外壳的候选 —— 并进去的话，一个不存在的图片路径会被回退成
 *     200 + index.html，于是「图丢了」表现为「拿到一坨 HTML」。
 *
 * 只接受扁平的文件名。上传落盘本来就是扁平的，允许子路径只会多出一层
 * 需要自己去证明的穿越防护。
 */
app.use('/uploads', (req, res, next) => {
  let name
  try {
    name = decodeURIComponent(String(req.path ?? '/').replace(/^\/+/, ''))
  } catch {
    return next()
  }
  if (!name || name.includes('/') || name.includes('\\') || name.startsWith('.')) return next()

  const file = join(UPLOAD_DIR, name)
  if (!existsSync(file) || !statSync(file).isFile()) return next()

  res.setHeader('Content-Type', MIME[extname(file)] ?? 'application/octet-stream')
  res.setHeader('Cache-Control', 'public, max-age=3600')
  /*
   * SVG 是同源脚本载体：直接访问它时浏览器按文档渲染，会执行里面的 <script> ——
   * 那样「上传一张图」就等于「拿到一个同源 XSS 落点」。这两个头把这条路堵死：
   * nosniff 禁止按内容猜类型，CSP 让文档上下文里的脚本与外部请求全部失效。
   * 作为 <img> 引用时它照常显示：CSP 约束的是文档，不是图片子资源。
   */
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:"
  )
  createReadStream(file).pipe(res)
})

app.get('/healthz', (_req, res) => {
  res.type('text/plain').set('Cache-Control', 'no-store').send('ok')
})

// ---------------------------------------------------------------- 静态资源
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
  '.gif': 'image/gif',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
}

function resolveStatic(pathname) {
  const target = normalize(join(DIST, decodeURIComponent(pathname)))
  if (target !== DIST && !target.startsWith(DIST + sep)) return null
  if (existsSync(target) && statSync(target).isFile()) return target
  return null
}

if (process.env.SERVE_STATIC !== '0') {
  if (!existsSync(join(DIST, 'index.html'))) {
    console.warn(`[serve] 未找到构建产物（${DIST}），只提供 API。执行 npm run build 后再起服务。`)
  } else {
    app.use((req, res, next) => {
      const pathname = (req.url ?? '/').split('?')[0]

      /*
       * /api/* 一律不参与静态回退。
       * 这些路径同样「无扩展名」，不拦住的话会被当成 SPA 壳回退成 index.html(200)——
       * 于是把接口路径写错伪装成「请求成功」，客户端拿到一坨 HTML 还得靠解析失败才发现。
       * 放行给后面的 API 404 处理器，老实返回 JSON 404。
       */
      if (pathname === '/api' || pathname.startsWith('/api/')) return next()

      const isShellCandidate = extname(pathname) === ''

      let file = resolveStatic(pathname)
      if (!file && isShellCandidate) file = join(DIST, 'index.html')
      if (!file) return next()

      const isShell = file === join(DIST, 'index.html')
      if (isShell) {
        /*
         * 维护模式只拦「页面外壳」，不拦静态资源与后台。
         *
         * 为什么只拦外壳：
         * - 后台（/admin）本身就是用来关掉维护模式的入口，拦掉它就会把自己锁在门外；
         * - 后台 SPA 自己也要加载 /assets/*.js，拦资源等于让管理模式无法操作；
         * - 直接 502 会让访客以为服务坏了，这里给一个说明清楚的中性页面。
         *
         * 返回 503 而非 200：搜索引擎对「临时不可用」的处理是保留索引而不是删除收录，
         * 这正是维护模式的语义。
         */
        if (!pathname.startsWith('/admin') && getSetting('maintenance', '0') === '1') {
          res
            .status(503)
            .set('Retry-After', '1800')
            .set('Cache-Control', 'no-store')
            .type('text/html; charset=utf-8')
            .send(maintenancePage({ brand: getSetting('brand', 'Tech Notes') }))
          return
        }

        // 只统计展示站的浏览：后台自己的访问不该抬高「独立访客」
        if (!pathname.startsWith('/admin')) {
          const ua = req.get('user-agent') ?? ''
          /*
           * 同一份 ip + UA 同时喂给两条链路：
           *   page_views    —— 加盐哈希，服务仪表盘的长期趋势，永不落明文；
           *   visitor_logs  —— 原始 IP 与 UA，服务后台访客列表的地区与设备。
           * 两条互不依赖，删掉明文那条也不影响匿名统计的历史。
           */
          recordPageView(pathname, privacyHash(`${req.ip}|${ua}`))
          recordVisit(req.ip, ua, pathname)
        }
      }
      /*
       * 页面外壳：title 与 description 按库里的站点设置注入后再发出。
       *
       * 只有外壳走这条路 —— 静态资源仍然直接流式返回，不会被读进内存。
       * 外壳本身走 no-cache，所以每次请求重新注入不存在缓存不一致。
       */
      if (isShell) {
        const html = renderShell()
        if (html) {
          res.setHeader('Content-Type', 'text/html; charset=utf-8')
          res.setHeader('Cache-Control', 'no-cache')
          res.send(html)
          return
        }
        // 外壳渲染不可用（构建产物读不动）时退回下面的静态读取：
        // 少一句正确的标题，比页面直接打不开轻得多。
      }

      res.setHeader('Content-Type', MIME[extname(file)] ?? 'application/octet-stream')
      res.setHeader(
        'Cache-Control',
        isShell
          ? 'no-cache'
          : pathname.startsWith('/assets/')
            ? 'public, max-age=31536000, immutable'
            : 'public, max-age=3600'
      )
      createReadStream(file).pipe(res)
    })
  }
}

app.use((req, res) => {
  if (req.path === '/api' || req.path.startsWith('/api/')) {
    return res.status(404).json({ error: '接口不存在' })
  }
  res.status(404).type('text/plain').send('404 Not Found')
})

// eslint-disable-next-line no-unused-vars -- Express 靠 4 个形参识别错误处理中间件
app.use((err, _req, res, _next) => {
  if (res.headersSent) return

  /*
   * body-parser 这类中间件抛的是**客户端**错误（JSON 写坏了、载荷超限），
   * 它们自带 4xx 的 status。此前一律回 500，于是「请求格式不对」看起来像服务端崩了 ——
   * 排查时会往服务端白找一圈。所以这里尊重 4xx，只有真正的服务端异常才回 500
   * 并打完整堆栈（4xx 不打：它每天都会被扫描器触发几次，没有信息量）。
   */
  const status = Number(err?.status ?? err?.statusCode ?? 0)
  if (status >= 400 && status < 500) {
    return res.status(status).json({ error: status === 413 ? '请求内容过大' : '请求格式不正确' })
  }

  console.error('[server] 未捕获错误:', err)
  res.status(500).json({ error: '服务端内部错误' })
})

// ---------------------------------------------------------------- 启动
pruneExpired()
setInterval(pruneExpired, 30 * 60 * 1000).unref()

/*
 * 日志保留策略：启动时清一次，之后每天一次。
 * 与「站点设置 → 操作日志」页面上写的「保留 90 天」对齐 —— 界面承诺了保留期，
 * 就必须真的有人执行，否则那行说明只是装饰。
 * 手动清理走 POST /admin/audit-logs/prune（会记一条账），这里不记账，
 * 否则每天都会往日志里写一条「我清理了日志」。
 */
function pruneAudit() {
  const { removed } = pruneAuditLogs()
  if (removed > 0) console.log(`[audit] 已清理 ${removed} 条超出保留期的操作日志`)
}
pruneAudit()
setInterval(pruneAudit, 24 * 60 * 60 * 1000).unref()

/*
 * 访客明细独立计时（30 天，见 db.mjs 的 VISITOR_RETENTION_DAYS）。
 * 与审计日志分开的理由是两者的价值不同：审计是「谁改了什么」的凭据，
 * 需要按合规口径留久一点；访客明文 IP 只是运营参考，留得越久越接近长期跟踪。
 * 同样不记账 —— 每天往日志里写一条「我清理了访客记录」是噪音。
 */
function pruneVisits() {
  const { removed } = pruneVisitorLogs()
  if (removed > 0) console.log(`[visitor] 已清理 ${removed} 条超出保留期的访客记录`)
}
pruneVisits()
setInterval(pruneVisits, 24 * 60 * 60 * 1000).unref()

app.listen(PORT, HOST, () => {
  console.log(`[server] 已就绪 → http://${HOST}:${PORT}`)
  console.log(`[server] 后台入口 → http://${HOST}:${PORT}/admin`)
  console.log(`[server] 静态目录：${process.env.SERVE_STATIC === '0' ? '(已关闭)' : DIST}`)
  if (getSetting('maintenance', '0') === '1') {
    console.warn('[server] 注意：维护模式当前为开启状态，前台访客只看到维护提示')
  }
})
