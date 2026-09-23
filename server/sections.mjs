/**
 * 结构化区块的读写与校验。
 *
 * 区块在库里是「一键一份 JSON 文档」（`site_sections`），前台按文档形状直接渲染。
 * 因此这里的职责只有两件：**拒绝文档变坏**、**如实记录改了什么**。
 *
 * 保存粒度是**整份区块文档**，不是字段级补丁。理由是嵌套数组上做深合并没有
 * 唯一正确答案 —— 提交一个空数组，到底是「清空」还是「没改」？说不清的事不做，
 * 界面也就只能整块保存（与画布上「保存」的位置一致）。
 *
 * 校验由 `shared/sections.mjs` 的约束表驱动，不在这里另写一份长度上限 ——
 * 界面上字数计数用的就是同一份，改一处两边同时变。
 */
import { all, get, run, nowIso } from './db.mjs'
import { SECTION_SPECS, getSectionSpec, readPath } from '../shared/sections.mjs'

/** 一份文档里出现过的全部叶子路径，用来揪出规格外的键。 */
function leafPaths(value, prefix = '') {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return [prefix]
  const out = []
  for (const [key, child] of Object.entries(value)) {
    out.push(...leafPaths(child, prefix ? `${prefix}.${key}` : key))
  }
  return out
}

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)

/** 报错时带上字段中文名：`主按钮链接 需要以 / 或 http(s):// 开头` 比 `数据不合法` 有用。 */
function fieldLabel(spec, path) {
  return spec.labels?.[path] ?? path
}

/**
 * 单值校验。返回 `{ value }` 或 `{ error }`。
 *
 * 文本统一 `trim`：前后空格在界面上看不出来，存进去却会让前台多出一个空档。
 */
function checkScalar(rule, raw, label) {
  const type = rule.type ?? 'text'

  if (type === 'bool') {
    if (typeof raw !== 'boolean') return { error: `${label} 需要是布尔值` }
    return { value: raw }
  }

  if (typeof raw !== 'string') return { error: `${label} 需要是文本` }
  const text = raw.trim()

  if (rule.required && !text) return { error: `${label} 不能为空` }

  if (type === 'url' || type === 'link') {
    /*
     * 这两类值最终会变成 href / src。只放行站内相对路径与 http(s)：
     * 留一个 `javascript:` 的口子，就等于让「改一段文案」变成「挂一段脚本」。
     */
    if (text && !/^(https?:\/\/|\/)/i.test(text)) {
      return { error: `${label} 需要以 / 或 http(s):// 开头` }
    }
  }

  if (rule.max !== undefined && text.length > rule.max) {
    return { error: `${label} 最多 ${rule.max} 个字符（当前 ${text.length}）` }
  }

  return { value: text }
}

/**
 * 列表校验，三种形态：
 *   chips   字符串数组
 *   records 对象数组（条目内的标量字段 + 可选的**嵌套列表**，结构与外层同构 ——
 *           工作经历条目下既有一串要点，又挂着若干项目，那些项目自己也带要点）
 *   ids     取值受限的字符串数组（简历模块顺序与显示状态）
 */
function checkList(rule, raw, label) {
  if (!Array.isArray(raw)) return { error: `${label} 需要是列表` }

  if (rule.type === 'ids') {
    const seen = new Set()
    const items = []
    for (const item of raw) {
      if (typeof item !== 'string') return { error: `${label} 里每一项都需要是文本` }
      const id = item.trim()
      if (!id) continue
      if (!rule.values.includes(id)) return { error: `${label} 出现未知项「${id}」` }
      if (seen.has(id)) return { error: `${label} 里的「${id}」重复了` }
      seen.add(id)
      items.push(id)
    }
    /*
     * 顺序表必须不重不漏：少一项，前台就会静默少渲染一节 ——
     * 那是最难查的一类「改了不生效」，所以在入口就拒收。
     */
    if (rule.exhaustive && items.length !== rule.values.length) {
      return { error: `${label} 需要不重不漏地列出 ${rule.values.length} 项（当前 ${items.length}）` }
    }
    return { value: items }
  }

  if (rule.type === 'chips') {
    const items = []
    for (const item of raw) {
      if (typeof item !== 'string') return { error: `${label} 里每一项都需要是文本` }
      const text = item.trim()
      /* 清空一格再保存是常规操作，不当作错误，直接丢掉空格 */
      if (text) items.push(text)
    }
    if (items.length > rule.maxItems) {
      return { error: `${label} 最多 ${rule.maxItems} 条（当前 ${items.length}）` }
    }
    const tooLong = items.find((t) => t.length > rule.itemMax)
    if (tooLong) return { error: `${label} 的单条不能超过 ${rule.itemMax} 字：「${tooLong}」` }
    return { value: items }
  }

  if (raw.length > rule.maxItems) {
    return { error: `${label} 最多 ${rule.maxItems} 条（当前 ${raw.length}）` }
  }

  const scalarFields = rule.itemFields ?? {}
  const childLists = rule.itemLists ?? {}
  const allowed = new Set([...Object.keys(scalarFields), ...Object.keys(childLists)])
  const items = []
  for (let i = 0; i < raw.length; i += 1) {
    const row = raw[i]
    if (!isPlainObject(row)) return { error: `${label} 的第 ${i + 1} 条需要是对象` }

    for (const key of Object.keys(row)) {
      if (!allowed.has(key)) return { error: `${label} 的第 ${i + 1} 条出现未知字段「${key}」` }
    }

    const item = {}
    for (const [key, sub] of Object.entries(scalarFields)) {
      const checked = checkScalar(sub, row[key] ?? '', `${sub.label ?? key}`)
      if (checked.error) return { error: `${label} 第 ${i + 1} 条：${checked.error}` }
      item[key] = checked.value
    }
    for (const [key, sub] of Object.entries(childLists)) {
      const checked = checkList(sub, row[key] ?? [], `${label} 第 ${i + 1} 条 · ${sub.label ?? key}`)
      if (checked.error) return { error: checked.error }
      item[key] = checked.value
    }
    items.push(item)
  }
  return { value: items }
}

/**
 * 校验并归一化一份区块文档。返回 `{ error }` 或 `{ values }`，**不落库**。
 *
 * 归一化是「只保留规格里声明过的键」：请求里多带的键不是被默默丢掉，
 * 而是直接报错 —— 后台前端发错一个字段名，应该当场发现，而不是等前台白屏。
 */
export function validateSection(key, body) {
  const spec = getSectionSpec(key)
  if (!spec) return { error: `「${key}」不是可编辑的区块` }
  if (!isPlainObject(body)) return { error: '请求体需要是一个对象' }

  const unknown = leafPaths(body).filter(
    (p) => !Object.prototype.hasOwnProperty.call(spec.fields ?? {}, p) &&
      !Object.prototype.hasOwnProperty.call(spec.lists ?? {}, p)
  )
  if (unknown.length) return { error: `出现未知字段「${unknown[0]}」` }

  const values = {}

  for (const [path, rule] of Object.entries(spec.fields ?? {})) {
    const raw = readPath(body, path)
    const label = fieldLabel(spec, path)
    if (raw === undefined) {
      if (rule.required) return { error: `${label} 不能为空` }
      continue
    }
    const checked = checkScalar(rule, raw, label)
    if (checked.error) return { error: checked.error }
    /* 点号路径要还原成嵌套结构 */
    const parts = path.split('.')
    let cursor = values
    for (const part of parts.slice(0, -1)) {
      cursor[part] = cursor[part] ?? {}
      cursor = cursor[part]
    }
    cursor[parts[parts.length - 1]] = checked.value
  }

  for (const [key2, rule] of Object.entries(spec.lists ?? {})) {
    const raw = body[key2]
    if (raw === undefined) continue
    const checked = checkList(rule, raw, rule.label ?? key2)
    if (checked.error) return { error: checked.error }
    values[key2] = checked.value
  }

  /* 主标题这类联合上限：单看任一段都合规，合起来才超 */
  for (const counter of Object.values(spec.counters ?? {})) {
    const parts = counter.keys.map((k) => readPath(values, k))
    if (parts.some((v) => typeof v !== 'string')) continue
    const joined = parts.join(counter.separator ?? '')
    if (joined.length > counter.max) {
      return { error: `${counter.label} 合计最多 ${counter.max} 个字符（当前 ${joined.length}）` }
    }
  }

  return { values }
}

/**
 * 后台读区块：带上规格与保存时间。
 *
 * 保存时间要真值：画布右侧预览卡写着「上次保存 · 2 分钟前」，那行字必须有来源，
 * 不能是画上去的装饰。
 */
export function readSectionsAdmin(module) {
  const rows = new Map(all('SELECT key, data, updated_at FROM site_sections').map((r) => [r.key, r]))
  const items = []
  for (const [key, spec] of Object.entries(SECTION_SPECS)) {
    if (module && spec.module !== module) continue
    const row = rows.get(key)
    let data = null
    if (row) {
      try {
        data = JSON.parse(row.data)
      } catch {
        /* 坏掉的 JSON 交给前台兜底，界面上如实显示成空，而不是让整屏打不开 */
        data = null
      }
    }
    items.push({
      key,
      label: spec.label,
      title: spec.title,
      desc: spec.desc,
      subject: spec.subject,
      panelOnly: spec.panelOnly === true,
      fields: spec.fields ?? {},
      lists: spec.lists ?? {},
      counters: spec.counters ?? {},
      labels: spec.labels ?? {},
      data: data ?? buildBlank(spec),
      updatedAt: row?.updated_at ?? null,
    })
  }
  return items
}

/**
 * 库里还没有这一块时的空文档。
 *
 * 空串而不是 `undefined`：表单要把每个格子都渲染出来，缺键会让输入框
 * 在「受控 / 非受控」之间来回切（React 会警告）。列表给空数组，同理。
 *
 * 例外是 `exhaustive` 的 ids 列表（简历模块顺序）：它的「空」是**没有意义**的 ——
 * 空顺序表在前台等于少渲染全部小节。这种列表的空值取规格里的全集，
 * 于是「尚未保存过」时界面拿到的就是默认顺序，而不是一片空白。
 */
function buildBlank(spec) {
  const out = {}
  for (const [path, rule] of Object.entries(spec.fields ?? {})) {
    const parts = path.split('.')
    let cursor = out
    for (const part of parts.slice(0, -1)) {
      cursor[part] = cursor[part] ?? {}
      cursor = cursor[part]
    }
    cursor[parts[parts.length - 1]] = (rule.type ?? 'text') === 'bool' ? false : ''
  }
  for (const [key, rule] of Object.entries(spec.lists ?? {})) {
    out[key] = rule.type === 'ids' && rule.exhaustive ? [...rule.values] : []
  }
  return out
}

/**
 * 写一份区块文档。
 *
 * 值没变就不写、不记日志：反复点保存不该在操作日志里刷出一串无信息量的记录，
 * 那会让真正改动过的那一次更难被翻到。
 */
export function writeSection(key, values) {
  const spec = getSectionSpec(key)
  if (!spec) return { ok: false, error: `「${key}」不是可编辑的区块` }

  const before = get('SELECT data FROM site_sections WHERE key = ?', key)?.data ?? null
  let beforeDoc = null
  if (before) {
    try {
      beforeDoc = JSON.parse(before)
    } catch {
      beforeDoc = null
    }
  }

  const next = JSON.stringify(values)
  if (beforeDoc && JSON.stringify(beforeDoc) === next) {
    return {
      ok: true,
      changed: false,
      fields: [],
      data: values,
      updatedAt: get('SELECT updated_at FROM site_sections WHERE key = ?', key)?.updated_at ?? null,
    }
  }

  const ts = nowIso()
  run(
    `INSERT INTO site_sections (key, data, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
    key,
    next,
    ts
  )
  return {
    ok: true,
    changed: true,
    fields: changedSectionLabels(spec, beforeDoc, values),
    data: values,
    updatedAt: ts,
  }
}

/**
 * 真的变了的字段名。
 *
 * 界面是**整份提交**的（见文件头注释），所以不能把提交上来的字段照单全收地记成
 * 「改了什么」—— 那样每次日志都会列出全部字段，等于没写。这里逐字段与旧值比对，
 * 只报差异；顶层聚合（主按钮的文案与链接合起来算一处）是为了让文案可读。
 */
export function changedSectionLabels(spec, before, after) {
  const labels = []
  const push = (name) => {
    if (name && !labels.includes(name)) labels.push(name)
  }
  const labelOf = (key) => spec.labels?.[key] ?? spec.lists?.[key]?.label ?? key

  const tops = new Set()
  for (const path of Object.keys(spec.fields ?? {})) tops.add(path.split('.')[0])
  for (const key of tops) {
    if (readPath(after, key) === undefined) continue
    if (JSON.stringify(readPath(before, key)) !== JSON.stringify(readPath(after, key))) {
      push(labelOf(key))
    }
  }

  for (const key of Object.keys(spec.lists ?? {})) {
    if (after[key] === undefined) continue
    if (JSON.stringify(before?.[key]) !== JSON.stringify(after[key])) push(labelOf(key))
  }

  return labels
}

/** 区块名 + 改动字段，给审计日志用。 */
export function describeSectionChange(spec, labels) {
  return labels.length ? `${spec.subject} · ${labels.join('、')}` : spec.subject
}
