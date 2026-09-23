/**
 * SQLite 数据层 —— 内容与后台状态的唯一持久化位置。
 *
 * 用 Node 内置的 `node:sqlite`（DatabaseSync），不引 better-sqlite3：
 * 免去 node-gyp 编译，镜像可以继续用 node:*-slim，不需要 python3 / make / g++。
 * 代价是要求 Node ≥ 24（22 上该模块仍会打 ExperimentalWarning）。
 *
 * 时间口径：时间戳一律存 UTC ISO 串；需要「按天分组」时另存本地日（`localDay`），
 * 避免依赖 SQLite 的 date() 在容器 TZ 下的隐式行为。
 */
import { DatabaseSync } from 'node:sqlite'
import { chmodSync, mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { content } from '../shared/content.mjs'
import { readingLabel } from '../shared/derive.mjs'

export const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))

/**
 * 构建产物目录（静态资源根）。与 `server/index.mjs` 的 `DIST` 同源：
 * 都尊重 `DIST_DIR`，默认 `dist/`。`public/` 里的内容（含 `public/images`）
 * 在 vite build 时会被并进 `dist/`，运行期镜像里**没有** `public/` 目录，
 * 所以任何「找构建后的静态文件」的判断都要以这里为根，而不是 `public/`。
 */
export const distDir = resolve(process.env.DIST_DIR ?? join(projectRoot, 'dist'))

export const dbPath = process.env.DB_PATH ?? resolve(projectRoot, 'data/tech-notes.db')
mkdirSync(dirname(dbPath), { recursive: true })
try {
  chmodSync(dirname(dbPath), 0o700)
} catch {
  /* 只读卷或非 POSIX 平台忽略 */
}

export const db = new DatabaseSync(dbPath)
db.exec('PRAGMA journal_mode = WAL')
db.exec('PRAGMA foreign_keys = ON')
db.exec('PRAGMA busy_timeout = 4000')

// ----------------------------------------------------------------- 时间助手
const TZ = process.env.TZ ?? 'Asia/Shanghai'
const dayFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

export const nowIso = () => new Date().toISOString()
/** 本地日（YYYY-MM-DD），用于按天分组统计。 */
export const localDay = (d = new Date()) => dayFormatter.format(d)
/** 从今天往前数 n 天的本地日。 */
export function localDayOffset(n) {
  return localDay(new Date(Date.now() - n * 86400000))
}
/** ISO 串 → 'MM-DD'，用于图表横轴。 */
export const shortDay = (ymd) => String(ymd).slice(5)
/** ISO 串 → 'YYYY-MM-DD HH:mm'（本地）。 */
export function formatLocal(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return String(iso)
  const p = (n) => String(n).padStart(2, '0')
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d)
  const g = (t) => parts.find((x) => x.type === t)?.value ?? ''
  return `${g('year')}-${g('month')}-${g('day')} ${g('hour')}:${g('minute')}`
}

// ----------------------------------------------------------------- 表结构
// 站点尚未对外，表结构一次建到最终形态，不保留历史迁移兼容逻辑。
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    email         TEXT    NOT NULL UNIQUE,
    display_name  TEXT    NOT NULL,
    role          TEXT    NOT NULL DEFAULT 'super_admin',
    password_hash TEXT    NOT NULL,
    password_salt TEXT    NOT NULL,
    avatar_url    TEXT,
    must_change_password INTEGER NOT NULL DEFAULT 0,
    created_at    TEXT    NOT NULL,
    updated_at    TEXT    NOT NULL
  );

  CREATE TABLE IF NOT EXISTS admin_2fa (
    user_id      INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    secret       TEXT    NOT NULL,
    enabled      INTEGER NOT NULL DEFAULT 0,
    device_label TEXT,
    confirmed_at TEXT,
    created_at   TEXT    NOT NULL,
    updated_at   TEXT    NOT NULL
  );

  CREATE TABLE IF NOT EXISTS recovery_codes (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    code_hash  TEXT    NOT NULL,
    used_at    TEXT,
    created_at TEXT    NOT NULL
  );

  -- 登录会话：服务端持有，可逐条吊销（「登录设备」列表即读这张表）
  CREATE TABLE IF NOT EXISTS sessions (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash   TEXT    NOT NULL UNIQUE,
    remember     INTEGER NOT NULL DEFAULT 0,
    user_agent   TEXT,
    ip           TEXT,
    created_at   TEXT    NOT NULL,
    last_seen_at TEXT    NOT NULL,
    expires_at   TEXT    NOT NULL
  );

  -- 密码校验通过、但尚未过 2FA 的中间凭证。5 分钟过期、一次性消费。
  CREATE TABLE IF NOT EXISTS login_tickets (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash  TEXT    NOT NULL UNIQUE,
    remember    INTEGER NOT NULL DEFAULT 0,
    ip          TEXT,
    user_agent  TEXT,
    created_at  TEXT    NOT NULL,
    expires_at  TEXT    NOT NULL,
    consumed_at TEXT
  );

  CREATE TABLE IF NOT EXISTS audit_logs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER,
    actor       TEXT    NOT NULL,
    action      TEXT    NOT NULL,
    target_type TEXT,
    target_id   TEXT,
    detail      TEXT,
    result      TEXT    NOT NULL DEFAULT 'success',
    ip          TEXT,
    user_agent  TEXT,
    created_at  TEXT    NOT NULL
  );

  -- ---------------------------------------------------------- 内容域
  CREATE TABLE IF NOT EXISTS posts (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    slug         TEXT    NOT NULL UNIQUE,
    title        TEXT    NOT NULL,
    category     TEXT    NOT NULL DEFAULT '',
    excerpt      TEXT    NOT NULL DEFAULT '',
    -- Markdown 原文。前台渲染时先转义再解析，不接受内联 HTML。
    body         TEXT    NOT NULL DEFAULT '',
    status       TEXT    NOT NULL DEFAULT 'draft',
    views        INTEGER NOT NULL DEFAULT 0,
    /*
     * 阅读时长**由正文派生**（shared/derive.mjs）。这一列只是列表页的缓存：
     * 列表不加载 body，逐个现算要多读全部正文。写入正文时一并刷新即可，
     * 因此它可能落后于正文 —— 前台文章页不读这一列，永远现算。
     */
    reading_time TEXT    NOT NULL DEFAULT '',
    cover_image  TEXT,
    -- 留 NULL 而不是空串：仪表盘「待补充 SEO 摘要」按 IS NULL OR = '' 计数
    seo_description TEXT,
    published_at TEXT,
    created_at   TEXT    NOT NULL,
    updated_at   TEXT    NOT NULL
  );

  CREATE TABLE IF NOT EXISTS categories (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL UNIQUE,
    slug        TEXT    NOT NULL UNIQUE,
    description TEXT    NOT NULL DEFAULT '',
    sort_order  INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT    NOT NULL
  );

  /*
   * 标签与分类的分工：分类一篇一个（决定归档与列表筛选），标签一篇多个（决定关键词）。
   * 分类名直接存在 posts.category 上（不是外键）——改名时要一并更新文章，
   * 但比多一层 id 映射更直观，也让列表查询少一次 join。标签没有这个便利，
   * 因为它是多对多，必须有中间表。
   */
  CREATE TABLE IF NOT EXISTS tags (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT    NOT NULL UNIQUE,
    slug       TEXT    NOT NULL UNIQUE,
    created_at TEXT    NOT NULL
  );

  CREATE TABLE IF NOT EXISTS post_tags (
    post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    tag_id  INTEGER NOT NULL REFERENCES tags(id)  ON DELETE CASCADE,
    PRIMARY KEY (post_id, tag_id)
  );

  CREATE TABLE IF NOT EXISTS projects (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    slug        TEXT    NOT NULL UNIQUE,
    title       TEXT    NOT NULL,
    description TEXT    NOT NULL DEFAULT '',
    tags        TEXT    NOT NULL DEFAULT '',
    language    TEXT    NOT NULL DEFAULT '',
    stars       INTEGER NOT NULL DEFAULT 0,
    forks       INTEGER NOT NULL DEFAULT 0,
    repo_url    TEXT,
    -- 首页「精选项目」按它取；全部未标记时前台退化为按 sort_order 取前 3
    featured    INTEGER NOT NULL DEFAULT 0,
    status      TEXT    NOT NULL DEFAULT 'published',
    sort_order  INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT    NOT NULL,
    updated_at  TEXT    NOT NULL
  );

  CREATE TABLE IF NOT EXISTS media (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    filename   TEXT    NOT NULL,
    url        TEXT    NOT NULL,
    mime       TEXT    NOT NULL DEFAULT '',
    bytes      INTEGER NOT NULL DEFAULT 0,
    width      INTEGER,
    height     INTEGER,
    alt        TEXT    NOT NULL DEFAULT '',
    created_at TEXT    NOT NULL
  );

  /*
   * 结构化内容区块：首页首屏 / 关于我 / 技术栈、简历各模块。
   *
   * 为什么用 JSON 文档而不是给每个字段开一列：这些是「一次性整体编辑、从不单独查询」
   * 的结构（嵌套列表为主）。开成列会得到几十个只被整体读写的列，schema 一路膨胀，
   * 换不来任何查询能力。反过来，凡是需要单独查/排序/统计的（文章、项目、分类）
   * 仍然是正经的表，没有偷懒塞进 JSON。
   */
  CREATE TABLE IF NOT EXISTS site_sections (
    key        TEXT PRIMARY KEY,
    data       TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS site_settings (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  -- 轻量访问统计：同一访客同一天同一路径只记一行（UNIQUE 兜底去重）。
  -- 不写 cookie、不存原始 IP —— visitor 是 ip+UA+日 的加盐哈希。
  -- 用途仅限仪表盘的「独立访客」与「阅读趋势」。
  CREATE TABLE IF NOT EXISTS page_views (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    day     TEXT NOT NULL,
    visitor TEXT NOT NULL,
    path    TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_page_views_unique ON page_views(day, visitor, path);
  CREATE INDEX IF NOT EXISTS idx_page_views_day ON page_views(day);

  -- 访客明细：记录原始 IP 与 UA，用于后台「访客记录」页展示来源地区与访问设备。
  -- 刻意与 page_views 分开两张表：
  --   page_views 是匿名聚合（哈希去重），服务于仪表盘的长期趋势，**永不落明文**；
  --   visitor_logs 落明文，因此有自己的保留期（见 VISITOR_RETENTION_DAYS），
  --   清理它不会动匿名统计，两者互不牵连。
  -- 不做 UNIQUE 去重：同一天同一 IP 刷新同一页也各记一行，
  -- 这样「最近访问时间」才是真的；页面外壳每次加载才写一条，量级可控。
  CREATE TABLE IF NOT EXISTS visitor_logs (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    day        TEXT NOT NULL,
    ip         TEXT NOT NULL,
    ua         TEXT NOT NULL DEFAULT '',
    path       TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_visitor_logs_day ON visitor_logs(day);
  CREATE INDEX IF NOT EXISTS idx_visitor_logs_ip  ON visitor_logs(ip);
  CREATE INDEX IF NOT EXISTS idx_visitor_logs_created ON visitor_logs(created_at);

  CREATE INDEX IF NOT EXISTS idx_posts_status ON posts(status);
  CREATE INDEX IF NOT EXISTS idx_posts_published ON posts(published_at);
  CREATE INDEX IF NOT EXISTS idx_post_tags_tag ON post_tags(tag_id);
  CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);
  CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token_hash);
`)

/*
 * 加列不做通用迁移框架，只处理「表已存在、缺这一列」这一种情况。
 *
 * 本机与服务器上都已经有装着内容的库，直接改 CREATE TABLE 对它们是无效的
 * （IF NOT EXISTS 直接跳过），而重建表等于丢掉已经编辑过的内容。
 * 这一句让老库平滑拿到新列。**新增列时照着补一行即可，不要在这里写通用版本。**
 */
function ensureColumn(table, column, ddl) {
  // 这里直接用 db.prepare 而不是查询助手：助手是 const，此刻还在 TDZ 里
  const exists = db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === column)
  if (!exists) db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`)
}
ensureColumn('projects', 'featured', 'featured INTEGER NOT NULL DEFAULT 0')

// ----------------------------------------------------------------- 查询助手
export const all = (sql, ...params) => db.prepare(sql).all(...params)
export const get = (sql, ...params) => db.prepare(sql).get(...params)
export const run = (sql, ...params) => db.prepare(sql).run(...params)

export function tx(fn) {
  db.exec('BEGIN')
  try {
    const out = fn()
    db.exec('COMMIT')
    return out
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
}

// ----------------------------------------------------------------- 种子数据
/**
 * 幂等：只在表为空时灌入，绝不覆盖后台已经改过的内容。
 *
 * 内容来自 `shared/content.mjs` —— 与前台兜底同一份，所以「断网时看到的」
 * 与「首次建库后的」在结构上必然一致。
 */
export function seedIfEmpty() {
  const ts = nowIso()
  const counts = { posts: 0, projects: 0, categories: 0, tags: 0, media: 0, settings: 0, sections: 0 }

  tx(() => {
    if (get('SELECT COUNT(*) AS n FROM categories').n === 0) {
      content.categories.forEach((name, i) => {
        run(
          'INSERT INTO categories (name, slug, description, sort_order, created_at) VALUES (?, ?, ?, ?, ?)',
          name,
          slugify(name),
          '',
          i,
          ts
        )
        counts.categories += 1
      })
    }

    // 标签必须先于文章写入：文章的标签是查现有标签表建立关联的
    if (get('SELECT COUNT(*) AS n FROM tags').n === 0) {
      for (const name of content.tags) {
        run('INSERT INTO tags (name, slug, created_at) VALUES (?, ?, ?)', name, slugify(name), ts)
        counts.tags += 1
      }
    }

    if (get('SELECT COUNT(*) AS n FROM posts').n === 0) {
      for (const p of content.posts) {
        /*
         * seo_description 留 NULL 而不是空串：仪表盘按 IS NULL OR = '' 统计
         * 「待补充 SEO 摘要」，空串会让这条待办与「已填但填空格」混在一起。
         */
        const info = run(
          `INSERT INTO posts (slug, title, category, excerpt, body, status, views, reading_time,
                              cover_image, seo_description, published_at, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          p.slug,
          p.title,
          p.category ?? '',
          p.excerpt ?? '',
          p.body ?? '',
          p.status ?? 'published',
          Number(p.views) || 0,
          readingLabel(p.body),
          p.coverImage ?? null,
          p.seoDescription ? p.seoDescription : null,
          p.publishedAt,
          p.publishedAt,
          p.publishedAt
        )
        const postId = Number(info.lastInsertRowid)
        for (const tagName of p.tags ?? []) {
          const tag = get('SELECT id FROM tags WHERE name = ?', tagName)
          if (tag) run('INSERT OR IGNORE INTO post_tags (post_id, tag_id) VALUES (?, ?)', postId, tag.id)
        }
        counts.posts += 1
      }
    }

    if (get('SELECT COUNT(*) AS n FROM projects').n === 0) {
      content.projects.forEach((p, i) => {
        run(
          `INSERT INTO projects (slug, title, description, tags, language, stars, forks, repo_url,
                                 featured, status, sort_order, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'published', ?, ?, ?)`,
          p.slug,
          p.title,
          p.description ?? '',
          p.tags ?? '',
          p.language ?? '',
          Number(p.stars) || 0,
          Number(p.forks) || 0,
          /*
           * 没有仓库地址就留空，**不合成**一个看起来能点的链接。
           * 早先这里按 slug 拼 `https://github.com/<用户名>/<slug>`，于是每张项目卡片
           * 都挂着一条 404 —— 比「没有链接」更糟：读者会以为自己点错了，
           * 而真正的原因是这条地址从来不存在。前台对空值不渲染链接。
           */
          p.repoUrl ?? null,
          p.featured ? 1 : 0,
          p.sortOrder ?? i,
          ts,
          ts
        )
        counts.projects += 1
      })
    }

    if (get('SELECT COUNT(*) AS n FROM media').n === 0) {
      for (const m of content.media) {
        run(
          'INSERT INTO media (filename, url, mime, bytes, alt, created_at) VALUES (?, ?, ?, ?, ?, ?)',
          m.filename,
          `/images/${m.filename}`,
          'image/png',
          0,
          m.alt,
          ts
        )
        counts.media += 1
      }
    }

    for (const [key, value] of Object.entries(content.settings)) {
      const row = get('SELECT value FROM site_settings WHERE key = ?', key)
      if (!row) {
        run('INSERT INTO site_settings (key, value, updated_at) VALUES (?, ?, ?)', key, value, ts)
        counts.settings += 1
      }
    }

    for (const [key, data] of Object.entries(content.sections)) {
      const row = get('SELECT key FROM site_sections WHERE key = ?', key)
      if (!row) {
        run('INSERT INTO site_sections (key, data, updated_at) VALUES (?, ?, ?)', key, JSON.stringify(data), ts)
        counts.sections += 1
      }
    }
  })

  return counts
}

export function getSetting(key, fallback = '') {
  return get('SELECT value FROM site_settings WHERE key = ?', key)?.value ?? fallback
}

/** 全部单项事实，键值对形态。用于拼装内容文档。 */
export function readSettingsMap() {
  const out = {}
  for (const row of all('SELECT key, value FROM site_settings')) out[row.key] = row.value
  return out
}

/**
 * 全部结构化区块，键 → 文档。
 *
 * 坏掉的 JSON 跳过而不是抛出：一块内容写坏不该让整站白屏，
 * 缺的那块由 `presentContent()` 的默认值兜住（前台会退化成「该区块为空」）。
 */
export function readSections() {
  const out = {}
  for (const row of all('SELECT key, data FROM site_sections')) {
    try {
      out[row.key] = JSON.parse(row.data)
    } catch {
      console.warn(`[db] 区块 ${row.key} 的 JSON 无法解析，已跳过`)
    }
  }
  return out
}

export function setSetting(key, value) {
  run(
    `INSERT INTO site_settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    key,
    String(value ?? ''),
    nowIso()
  )
}

export const slugify = (name) =>
  String(name)
    .trim()
    .toLowerCase()
    .replace(/[\s/]+/g, '-')
    .replace(/[^a-z0-9\u4e00-\u9fa5-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || `cat-${Date.now().toString(36)}`

/**
 * 同名时往后加序号，而不是直接报错 —— 标题重名是常事，链接撞车不该挡保存。
 *
 * `table` 只接受调用方写死的字面量（'posts' / 'projects' / 'categories' / 'tags'），
 * 不来自请求：它是要拼进 SQL 的。
 *
 * 放在这里而不是各个域模块里：文章、项目、分类、标签四处都要「唯一链接」，
 * 各写一份迟早会有一处忘了 `id IS NOT ?`（改自己时把自己判成重名）。
 */
export function uniqueSlug(base, excludeId = null, table = 'posts') {
  let slug = base
  let n = 1
  while (get(`SELECT id FROM ${table} WHERE slug = ? AND id IS NOT ?`, slug, excludeId)) {
    n += 1
    slug = `${base}-${n}`
  }
  return slug
}

/** 记录一次访问。UNIQUE 索引让重复访问静默丢弃，不需要先查再插。 */
export function recordPageView(path, visitorHash) {
  try {
    run(
      `INSERT OR IGNORE INTO page_views (day, visitor, path, created_at) VALUES (?, ?, ?, ?)`,
      localDay(),
      visitorHash,
      path,
      nowIso()
    )
  } catch {
    /* 统计失败绝不能影响正常请求 */
  }
}

/**
 * 访客明细的保留天数。
 *
 * 比审计日志（90 天）短：审计要能回溯「谁改了什么」，而访客明文 IP 只是运营参考，
 * 留得越久越接近「长期跟踪访问者」。30 天足够看清一个月的来源分布。
 */
export const VISITOR_RETENTION_DAYS = 30

/**
 * 记录一条访客明细（原始 IP + UA）。
 *
 * 与 recordPageView 一样吞掉异常：这是旁路的统计，任何失败都不该影响页面返回。
 * UA 截断到 512 字符 —— 正常 UA 不到 256，截断只为挡住刻意构造的超长头撑爆库存。
 */
export function recordVisit(ip, userAgent, path) {
  try {
    run(
      `INSERT INTO visitor_logs (day, ip, ua, path, created_at) VALUES (?, ?, ?, ?, ?)`,
      localDay(),
      String(ip ?? '').slice(0, 64),
      String(userAgent ?? '').slice(0, 512),
      path,
      nowIso()
    )
  } catch {
    /* 统计失败绝不能影响正常请求 */
  }
}

/**
 * 清理超出保留期的访客明细。
 *
 * 与审计日志同样的取舍：不做后台定时静默删除，只在启动时与手动触发时执行，
 * 「删了多少、什么时候删」都是看得见的动作。
 */
export function pruneVisitorLogs(days = VISITOR_RETENTION_DAYS) {
  const cutoff = new Date(Date.now() - days * 86400000).toISOString()
  const before = get('SELECT COUNT(*) AS n FROM visitor_logs')?.n ?? 0
  run('DELETE FROM visitor_logs WHERE created_at < ?', cutoff)
  const after = get('SELECT COUNT(*) AS n FROM visitor_logs')?.n ?? 0
  return { removed: before - after, cutoff }
}
