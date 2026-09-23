/**
 * 分类与标签的读写。
 *
 * 两张表看起来对称（都有 id / name / slug），实际约束完全不同，这个差别决定了
 * 这一屏几乎所有取舍：
 *
 * 1. **分类不是外键，标签是。** `posts.category` 存的是**分类名这个字符串**
 *    （见 `db.mjs` 里建表处的注释），所以：
 *      - 改名要连着 `posts.category` 一起改，否则那些文章会掉进一个筛不到的缝里
 *        （前台的筛选条是从 `categories` 表生成的，没有「那个名字」这一项）；
 *      - 删除前要先看有没有文章挂着它，`force` 时把那些文章置成空串（前台显示「未分类」）。
 * 2. **标签是多对多，删除天然只是解绑。** `post_tags` 对 `tag_id` 有 `ON DELETE CASCADE`，
 *    删一条标签只会掉关联，文章本身不受影响 —— 画布上那句「删除标签不会删除文章，
 *    仅解除关联」不是承诺，是这张表的结构。
 * 3. **分类有顺序，标签没有。** 顺序决定前台「博客」页筛选条的排列（`filters.blog`
 *    就是按 `sort_order` 拼的），所以它是拖拽排出来的；标签按使用频次排，
 *    频次是算出来的，不是摆出来的，因此没有「拖标签」这件事。
 *
 * 名字与近重复的判定在 `shared/taxonomy.mjs`：那些规则界面也要用（提示、计数、置灰）。
 */
import { all, get, nowIso, run, slugify, tx, uniqueSlug } from './db.mjs'
import {
  CATEGORY_NAME_MAX,
  TAG_NAME_MAX,
  TAXONOMY_POLICY,
  describeMergeGroup,
  duplicateGroups,
  normalizeName,
  validateTaxonomyName,
} from '../shared/taxonomy.mjs'

/* ------------------------------------------------------------------ 读 */

/**
 * 每个分类挂着多少篇文章。
 *
 * 口径：**不分状态**（草稿与回收站里的文章也挂在这个分类上）。这不是疏忽 ——
 * 删分类时要解绑的是全部挂着它的行，两处口径必须一致，否则会出现
 * 「界面上写着 0 篇、删的时候却拦下来说有 3 篇」。
 */
function categoryCounts() {
  const rows = all(
    "SELECT category AS name, COUNT(*) AS n FROM posts WHERE category <> '' GROUP BY category"
  )
  return new Map(rows.map((r) => [r.name, r.n]))
}

function tagCounts() {
  const rows = all('SELECT tag_id, COUNT(*) AS n FROM post_tags GROUP BY tag_id')
  return new Map(rows.map((r) => [r.tag_id, r.n]))
}

/** 名字排序：先忽略大小写，再按原始串兜底 —— 结果与运行环境的 ICU 无关，可复现。 */
function byName(a, b) {
  const x = String(a.name).toLowerCase()
  const y = String(b.name).toLowerCase()
  if (x !== y) return x < y ? -1 : 1
  if (a.name !== b.name) return a.name < b.name ? -1 : 1
  return 0
}

export function categoryItems() {
  const counts = categoryCounts()
  return all(
    'SELECT id, name, slug, description, sort_order, created_at FROM categories ORDER BY sort_order, id'
  ).map((r) => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    description: r.description,
    sortOrder: r.sort_order,
    createdAt: r.created_at,
    postCount: counts.get(r.name) ?? 0,
  }))
}

/**
 * 标签按**使用频次**降序 —— 画布上这一栏的副标题写的就是「按使用频次排序」。
 * 同频次按名字，保证顺序稳定（否则每次请求刷新一下，标签云就会跳一次位）。
 */
export function tagItems() {
  const counts = tagCounts()
  return all('SELECT id, name, slug, created_at FROM tags')
    .map((r) => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      createdAt: r.created_at,
      postCount: counts.get(r.id) ?? 0,
    }))
    .sort((a, b) => b.postCount - a.postCount || byName(a, b) || a.id - b.id)
}

/** 页面顶部与面板副标题要的几个数，一次算完。 */
export function taxonomyFacets() {
  const categories = get('SELECT COUNT(*) AS n FROM categories')?.n ?? 0
  const tags = get('SELECT COUNT(*) AS n FROM tags')?.n ?? 0
  const unusedTags =
    get('SELECT COUNT(*) AS n FROM tags WHERE id NOT IN (SELECT tag_id FROM post_tags)')?.n ?? 0
  const uncategorized = get("SELECT COUNT(*) AS n FROM posts WHERE category = ''")?.n ?? 0
  return { counts: { categories, tags, unusedTags, uncategorized } }
}

export function readTaxonomyAdmin() {
  const categories = categoryItems()
  const tags = tagItems()
  return {
    categories,
    tags,
    policy: TAXONOMY_POLICY,
    /* 近重复分组随列表下发：那颗「合并重复标签」据此如实置灰，而不是点下去才发现没事可做 */
    mergeGroups: spellOut(duplicateGroups(tags)),
    ...taxonomyFacets(),
  }
}

/**
 * 给每组补上那句话。
 *
 * 列表与合并回执都走这一个函数：界面上确认弹层里列的那几行，与操作日志里
 * 记下的那句，必须是同一句 —— 否则「弹层说会并成一条、日志里却是另一种说法」。
 */
function spellOut(groups) {
  return groups.map((g) => ({ key: g.key, keeper: g.keeper, drop: g.drop, text: describeMergeGroup(g) }))
}

/* --------------------------------------------------------------- 分类写 */

function categoryPayload(rawName) {
  const parsed = validateTaxonomyName(rawName, CATEGORY_NAME_MAX, '分类名')
  if (parsed.error) return { error: parsed.error }
  return { values: { name: parsed.value } }
}

/**
 * 分类**连近重复也不允许**（`自 托管` / `自托管` 视为同一个）。
 *
 * 这一点与标签刻意不同，理由不是「分类更重要」，而是两者**能不能事后收拾**：
 * 标签有「合并重复标签」，攒下近重复有地方归并；分类没有合并入口（画布也没给），
 * 而且分类名会被写进每一篇的 `posts.category`，前台筛选条上并排出现
 * 「自托管」与「自 托管」两项、各挂几篇，谁也没法把两边合起来。
 * 所以宁可在入口拦下，并指出已经有的那一个 —— 这也是「能用选项就不让人填」的落法。
 *
 * 另外分类只在后台这一屏创建（文章编辑器里选分类时，服务端会拒绝
 * `categories` 表里没有的名字），所以这个口子拦得住。
 */
function categoryNameClash(name, excludeId = null) {
  const key = normalizeName(name)
  const hit = categoryItems().find((c) => c.id !== excludeId && normalizeName(c.name) === key)
  return hit ? `已有分类「${hit.name}」，名称与它相同（忽略空格、大小写与分隔符）` : ''
}

export function createCategory(rawName) {
  const parsed = categoryPayload(rawName)
  if (parsed.error) return { error: parsed.error }
  const { name } = parsed.values

  if (get('SELECT id FROM categories WHERE name = ?', name)) return { error: `分类「${name}」已存在` }
  const clash = categoryNameClash(name)
  if (clash) return { error: clash }

  const next =
    (get('SELECT MAX(sort_order) AS n FROM categories')?.n ?? -1) + 1
  const info = run(
    'INSERT INTO categories (name, slug, description, sort_order, created_at) VALUES (?, ?, ?, ?, ?)',
    name,
    uniqueSlug(slugify(name), null, 'categories'),
    '',
    next,
    nowIso()
  )
  return { item: categoryItems().find((c) => c.id === Number(info.lastInsertRowid)) }
}

/**
 * 重命名。
 *
 * 必须连带改 `posts.category` —— 那才是前台筛选真正比对的字段。漏掉这一步，
 * 改完名字前台会多出一个空分类（筛选条里有、没有文章），而原来那些文章
 * 只有「全部」能看到。所以这两步在同一个事务里，要么都成，要么都不动。
 */
export function renameCategory(id, rawName) {
  const row = get('SELECT id, name FROM categories WHERE id = ?', id)
  if (!row) return { error: '分类不存在' }

  const parsed = categoryPayload(rawName)
  if (parsed.error) return { error: parsed.error }
  const { name } = parsed.values
  if (name === row.name) return { changed: false, item: categoryItems().find((c) => c.id === id) }

  const clash = get('SELECT id FROM categories WHERE name = ? AND id <> ?', name, id)
  if (clash) return { error: `分类「${name}」已存在` }
  const near = categoryNameClash(name, id)
  if (near) return { error: near }

  let moved = 0
  tx(() => {
    run(
      'UPDATE categories SET name = ?, slug = ? WHERE id = ?',
      name,
      uniqueSlug(slugify(name), id, 'categories'),
      id
    )
    moved = run('UPDATE posts SET category = ? WHERE category = ?', name, row.name).changes ?? 0
  })

  return { changed: true, movedPosts: Number(moved), item: categoryItems().find((c) => c.id === id) }
}

/**
 * 整份顺序一次提交，下标即顺序。
 *
 * 与项目排序同一条理由：接「把 A 移到 B 前面」的增量指令，就要求服务端复现
 * 前端那套移动算法，两边算错一次顺序就静默错位。所以长度必须对得上 ——
 * 前端也只在自己拿得到全部行时才允许拖。
 */
export function reorderCategories(rawIds) {
  if (!Array.isArray(rawIds) || !rawIds.length) return { error: '需要提供分类 ID 列表' }

  const ids = rawIds.map((v) => Number.parseInt(String(v), 10))
  if (ids.some((n) => !Number.isInteger(n))) return { error: '分类 ID 列表里有非法值' }
  if (new Set(ids).size !== ids.length) return { error: '分类 ID 列表里有重复项' }

  const total = get('SELECT COUNT(*) AS n FROM categories')?.n ?? 0
  if (ids.length !== total) return { error: `排序需要包含全部 ${total} 个分类（收到 ${ids.length} 个）` }

  tx(() => {
    ids.forEach((id, index) => {
      run('UPDATE categories SET sort_order = ? WHERE id = ?', index, id)
    })
  })
  return { reordered: ids.length, items: categoryItems() }
}

/**
 * 删除。
 *
 * 挂着文章时默认**拒删并带回清单**：这个分类名就存在那些文章的 `posts.category` 里，
 * 删掉它那些文章会变成既不属于任何筛选、也不在「未分类」之外的位置 ——
 * 白屏上的表现是「只在全部里看得到」。要删得传 `force`，那是管理员看清代价之后的
 * 第二次确认，此时才把那些文章置成空串（前台显示「未分类」）。
 */
export function deleteCategory(id, force = false) {
  const row = get('SELECT id, name FROM categories WHERE id = ?', id)
  if (!row) return { error: '分类不存在' }

  const posts = all(
    'SELECT id, title, status FROM posts WHERE category = ? ORDER BY id',
    row.name
  ).map((p) => ({ id: p.id, title: p.title, status: p.status }))

  if (posts.length && !force) {
    return { blocked: true, name: row.name, posts }
  }

  let unbound = 0
  tx(() => {
    if (posts.length) unbound = run("UPDATE posts SET category = '' WHERE category = ?", row.name).changes ?? 0
    run('DELETE FROM categories WHERE id = ?', id)
  })

  return { removed: 1, unbound: Number(unbound), item: { id, name: row.name } }
}

/* --------------------------------------------------------------- 标签写 */

function tagPayload(rawName) {
  const parsed = validateTaxonomyName(rawName, TAG_NAME_MAX, '标签名')
  if (parsed.error) return { error: parsed.error }
  return { values: { name: parsed.value } }
}

/**
 * 新建。
 *
 * 只按**原名**判重（库里 `name` 是 UNIQUE）。近重复（`typescript` 与 `TypeScript`）
 * 一律放行 —— 拦在这里并不能真的拦住：文章编辑器里的标签输入框也会顺手建标签，
 * 两条路径不可能给出两套规则。既然拦不住，就把它变成一件**看得见、能收拾**的事：
 * 列表随附的近重复分组 + 「合并重复标签」那个按钮。
 *
 * 分类那边相反（见 `categoryNameClash`）：它没有合并入口，名字还会被写进文章，
 * 所以在入口就拦下。同一屏里两条不同的规矩，是因为两者的事后出路不同。
 */
export function createTag(rawName) {
  const parsed = tagPayload(rawName)
  if (parsed.error) return { error: parsed.error }
  const { name } = parsed.values

  if (get('SELECT id FROM tags WHERE name = ?', name)) return { error: `标签「${name}」已存在` }

  const info = run(
    'INSERT INTO tags (name, slug, created_at) VALUES (?, ?, ?)',
    name,
    uniqueSlug(slugify(name), null, 'tags'),
    nowIso()
  )
  return { item: tagItems().find((t) => t.id === Number(info.lastInsertRowid)) }
}

export function renameTag(id, rawName) {
  const row = get('SELECT id, name FROM tags WHERE id = ?', id)
  if (!row) return { error: '标签不存在' }

  const parsed = tagPayload(rawName)
  if (parsed.error) return { error: parsed.error }
  const { name } = parsed.values
  if (name === row.name) return { changed: false, item: tagItems().find((t) => t.id === id) }

  const clash = get('SELECT id FROM tags WHERE name = ? AND id <> ?', name, id)
  if (clash) return { error: `标签「${name}」已存在` }

  /* 改名不动 `post_tags`：关联是按 id 的，标签叫什么名字都不影响它挂在哪几篇文章上 */
  run('UPDATE tags SET name = ?, slug = ? WHERE id = ?', name, uniqueSlug(slugify(name), id, 'tags'), id)
  return { changed: true, item: tagItems().find((t) => t.id === id) }
}

/** 删除单个标签。`post_tags` 的级联会把关联一并清掉，文章本身不动。 */
export function deleteTag(id) {
  const row = get('SELECT id, name FROM tags WHERE id = ?', id)
  if (!row) return { error: '标签不存在' }

  const unbound =
    get('SELECT COUNT(*) AS n FROM post_tags WHERE tag_id = ?', id)?.n ?? 0
  run('DELETE FROM tags WHERE id = ?', id)
  return { removed: 1, unbound, item: { id, name: row.name } }
}

/** 一次删掉所有 0 篇的标签。没有可删的时候如实返回 0，不假装做了事。 */
export function deleteUnusedTags() {
  const rows = all('SELECT id, name FROM tags WHERE id NOT IN (SELECT tag_id FROM post_tags) ORDER BY name')
  if (!rows.length) return { removed: 0, names: [] }

  tx(() => {
    for (const row of rows) run('DELETE FROM tags WHERE id = ?', row.id)
  })
  return { removed: rows.length, names: rows.map((r) => r.name) }
}

/**
 * 合并近重复标签。
 *
 * 组与「保留谁」全部由服务端现算（`shared/taxonomy.mjs` 的 `duplicateGroups`），
 * 不接受前端传来的 id 列表：这是一个会删数据的操作，参数从请求里来就等于把
 * 「删哪几条」交给调用方。前端只负责把服务端算出来的计划摆给人看。
 *
 * 每一步都在一个事务里：先把 `post_tags` 改指向保留者（`OR IGNORE` 吃掉
 * 「同一篇同时挂了两个近重复标签」的那种冲突），再删残留关联，最后删标签本身。
 */
export function mergeDuplicateTags() {
  const groups = duplicateGroups(tagItems())
  if (!groups.length) return { merged: 0, groups: [], renamed: 0 }

  let moved = 0
  let renamed = 0
  tx(() => {
    for (const group of groups) {
      for (const drop of group.drop) {
        moved +=
          run('UPDATE OR IGNORE post_tags SET tag_id = ? WHERE tag_id = ?', group.keeper.id, drop.id)
            .changes ?? 0
        run('DELETE FROM post_tags WHERE tag_id = ?', drop.id)
        renamed += run('DELETE FROM tags WHERE id = ?', drop.id).changes ?? 0
      }
    }
  })

  return {
    merged: groups.length,
    groups: spellOut(groups),
    movedPosts: Number(moved),
    renamed: Number(renamed),
  }
}
