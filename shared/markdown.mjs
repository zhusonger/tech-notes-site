/**
 * 极简 Markdown 解析 —— 解析成块结构，不生成 HTML。
 *
 * 为什么自己写而不是引 marked / markdown-it：
 *   1. 站点正文只用到「标题 / 段落 / 代码块 / 引用 / 列表」这五种块，不需要完整的
 *      CommonMark（表格、脚注、HTML 内联都属于用不上的攻击面）；
 *   2. **不生成 HTML 字符串**是这里的核心约束。解析结果交给 React 渲染成节点，
 *      文本一律作为 children 输出，由 React 转义 —— 因此不存在「忘了转义」这一说，
 *      也不需要 `dangerouslySetInnerHTML`。
 *
 * 支持范围（写清楚，避免作者以为写了会生效）：
 *   `## / ###` 标题、``` 围栏代码块、`>` 引用、`- / *` 无序列表、`1.` 有序列表、
 *   正文里的 `**强调**`、`` `行内代码` `` 与 `[文字](链接)`（行内解析在渲染层）。
 *   **不支持**内联 HTML、图片、表格 —— 需要时再逐个明确加上。
 */

/**
 * 标题转锚点 id：保留中英数字，其余折成连字符。
 *
 * 用中文做锚点是可行的（浏览器会自行编码 URL），但定位必须用
 * `document.getElementById`，不能走 `querySelector('#…')` —— 后者遇到
 * 需要转义的字符会直接抛错。
 */
export function headingId(text) {
  return (
    String(text)
      .trim()
      .toLowerCase()
      .replace(/[\s/]+/g, '-')
      .replace(/[^a-z0-9\u4e00-\u9fa5-]/g, '')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || 'section'
  )
}

/**
 * @typedef {object} MdBlock
 * @property {'h2'|'h3'|'p'|'code'|'quote'|'ul'|'ol'} type
 * @property {string}  [text]   段落 / 标题 / 代码 / 引用的文本
 * @property {string[]} [items] 列表项
 * @property {string}  [id]     标题锚点
 * @property {string}  [lang]   代码块语言标注
 */

/**
 * 解析 Markdown 为块序列 + 目录。
 *
 * 目录与正文**共用这一次解析**：分成两次解析（一次抽目录、一次渲染正文）时，
 * 同名标题的编号规则只要有一处不同，点目录就会跳到别的标题上。
 *
 * @param {string} source
 * @returns {{ blocks: MdBlock[], toc: { label: string, id: string }[] }}
 */
export function parseMarkdown(source) {
  const lines = String(source ?? '')
    .replace(/\r\n?/g, '\n')
    .split('\n')

  /** @type {MdBlock[]} */
  const blocks = []
  const toc = []
  const seen = new Map()

  const heading = (level, text) => {
    let id = headingId(text)
    const n = (seen.get(id) ?? 0) + 1
    seen.set(id, n)
    if (n > 1) id = `${id}-${n}`
    blocks.push({ type: level === 2 ? 'h2' : 'h3', text, id })
    if (level === 2) toc.push({ label: text, id })
  }

  const isBlank = (line) => /^\s*$/.test(line)
  const isFence = (line) => /^\s*```/.test(line)
  const isQuote = (line) => /^\s*>\s?/.test(line)
  const isUl = (line) => /^\s*[-*]\s+/.test(line)
  const isOl = (line) => /^\s*\d+[.)]\s+/.test(line)
  const isHeading = (line) => /^\s*#{1,6}\s+/.test(line)
  const startsBlock = (line) => isFence(line) || isQuote(line) || isUl(line) || isOl(line) || isHeading(line)

  let i = 0
  while (i < lines.length) {
    const line = lines[i]

    if (isBlank(line)) {
      i += 1
      continue
    }

    // 围栏代码块：语言标注只保留第一个词，且仅用于展示
    if (isFence(line)) {
      const lang = line.trim().replace(/^```/, '').trim().split(/\s+/)[0] ?? ''
      const body = []
      i += 1
      while (i < lines.length && !isFence(lines[i])) {
        body.push(lines[i])
        i += 1
      }
      i += 1 // 跳过收尾的 ```
      blocks.push({ type: 'code', text: body.join('\n'), lang })
      continue
    }

    const h = line.match(/^\s*(#{1,6})\s+(.+?)\s*$/)
    if (h) {
      // 只有 ## 与 ### 进正文层级：一级标题属于页面，正文里出现 h1 视为 h2
      const level = h[1].length === 3 ? 3 : 2
      heading(level, h[2])
      i += 1
      continue
    }

    if (isQuote(line)) {
      const body = []
      while (i < lines.length && (isQuote(lines[i]) || (!isBlank(lines[i]) && !startsBlock(lines[i]) && body.length > 0))) {
        body.push(lines[i].replace(/^\s*>\s?/, ''))
        i += 1
      }
      blocks.push({ type: 'quote', text: body.join('\n').trim() })
      continue
    }

    if (isUl(line) || isOl(line)) {
      const ordered = isOl(line)
      const items = []
      while (i < lines.length && (ordered ? isOl(lines[i]) : isUl(lines[i]))) {
        items.push(lines[i].replace(/^\s*(?:[-*]|\d+[.)])\s+/, ''))
        i += 1
      }
      blocks.push({ type: ordered ? 'ol' : 'ul', items })
      continue
    }

    // 段落：一直吃到空行或下一个块的开始
    const para = [line.trim()]
    i += 1
    while (i < lines.length && !isBlank(lines[i]) && !startsBlock(lines[i])) {
      para.push(lines[i].trim())
      i += 1
    }
    blocks.push({ type: 'p', text: para.join(' ') })
  }

  return { blocks, toc }
}

/**
 * 只要目录时的便捷入口 —— 内部仍走同一次 `parseMarkdown`，
 * 保证目录锚点与正文标题 id 完全一致。
 *
 * @param {string} source
 * @returns {{ label: string, id: string }[]}
 */
export function tocFromMarkdown(source) {
  return parseMarkdown(source).toc
}

/**
 * 链接协议白名单。
 *
 * `javascript:` / `data:` / `vbscript:` 这类协议在被点击时会执行脚本，而正文是
 * 作者可写的内容。这里不是「把危险字符过滤掉」——那种做法永远在被绕过——而是
 * **只放行白名单内的协议**，其余一律降级成纯文本，危险链接因此连 DOM 都进不去。
 *
 * 站内相对路径（`/blog`、`#anchor`）不带协议、无法执行脚本，同样放行；
 * 但 `//host` 这种协议相对写法要挡掉：它会指向另一个源，却看起来像站内链接。
 *
 * @param {string} href
 * @returns {string|null} 不可信时返回 null，由调用方降级为文本
 */
export function safeHref(href) {
  const raw = String(href ?? '').trim()
  if (!raw) return null
  if (raw.startsWith('//')) return null
  if (raw.startsWith('/') || raw.startsWith('#')) return raw
  return /^(?:https?:|mailto:)/i.test(raw) ? raw : null
}

/**
 * 行内文本切成片段，供渲染层逐段处理。
 *
 * 识别 `**强调**`、`` `行内代码` `` 与 `[文字](链接)`。切出来的 `text` 片段是
 * **纯文本**，由渲染层作为 children 交给 React 转义 —— 本模块任何位置都不拼 HTML。
 * 协议不在白名单内的链接会整段降级成文本（保持 `[文字](链接)` 原样，作者能自己看出
 * 链接没生效，而不是看到一个点不动的链接）。
 *
 * @param {string} text
 * @returns {{ kind: 'text'|'strong'|'code'|'link', text: string, href?: string }[]}
 */
export function parseInline(text) {
  /** @type {{ kind: 'text'|'strong'|'code'|'link', text: string, href?: string }[]} */
  const out = []
  const src = String(text ?? '')
  const pattern = /\*\*([^*]+)\*\*|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)/g
  let last = 0
  let m
  while ((m = pattern.exec(src)) !== null) {
    if (m.index > last) out.push({ kind: 'text', text: src.slice(last, m.index) })
    if (m[1] !== undefined) {
      out.push({ kind: 'strong', text: m[1] })
      last = m.index + m[0].length
    } else if (m[2] !== undefined) {
      out.push({ kind: 'code', text: m[2] })
      last = m.index + m[0].length
    } else {
      const href = safeHref(m[4])
      if (href) {
        out.push({ kind: 'link', text: m[3], href })
        last = m.index + m[0].length
      }
      // 协议不可信：不消费这一段，让它原样落进下面的文本里
    }
  }
  if (last < src.length) out.push({ kind: 'text', text: src.slice(last) })
  return out
}
