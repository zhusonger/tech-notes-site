/**
 * 正文渲染：把 Markdown 块结构渲染成 React 节点。
 *
 * 安全前提：**全程不生成 HTML 字符串**，也不使用 `dangerouslySetInnerHTML`。
 * 文本一律作为 children 交给 React，转义由 React 负责 —— 因此正文里写
 * `<script>` 只会被显示成字面文字，不存在「漏了一次转义」这种可能。
 *
 * 块解析在 `shared/markdown.mjs`（服务端目录锚点与这里共用同一次解析）。
 */
import type { ReactNode } from 'react'
import { parseInline, parseMarkdown } from '../../shared/markdown.mjs'

/** 与 shared/markdown.mjs 的 MdBlock 对应。跨 .mjs 的 JSDoc 类型在 tsc 下不稳，这里显式声明。 */
interface Block {
  type: 'h2' | 'h3' | 'p' | 'code' | 'quote' | 'ul' | 'ol'
  text?: string
  items?: string[]
  id?: string
  lang?: string
}

/** 行内元素：只认 **强调**、`行内代码` 与 [文字](链接)，其余按纯文本输出。 */
function inline(text: string): ReactNode[] {
  return parseInline(text).map((part, index) => {
    if (part.kind === 'strong') {
      return (
        <strong key={index} className="font-semibold text-[var(--color-ink)]">
          {part.text}
        </strong>
      )
    }
    if (part.kind === 'code') {
      return (
        <code
          key={index}
          className="rounded-[4px] border border-[var(--color-line-soft)] bg-[#F3EEE7] px-[5px] py-[1px] font-code text-[13px] text-[var(--color-ink)]"
        >
          {part.text}
        </code>
      )
    }
    /*
     * 链接：`href` 已由 shared/markdown.mjs 的 safeHref 过过协议白名单，
     * 到这里的都是 http/https/mailto 或站内相对路径，不存在 `javascript:`。
     * 仍加上 rel="noopener"：新标签页里的 `window.opener` 会反向操控本站页面。
     */
    if (part.kind === 'link') {
      return (
        <a
          key={index}
          href={part.href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[var(--color-primary)] underline decoration-[var(--color-primary)]/35 underline-offset-[3px] transition-colors hover:decoration-[var(--color-primary)]"
        >
          {part.text}
        </a>
      )
    }
    return part.text
  })
}

export function MarkdownBody({ source }: { source: string }) {
  if (!source.trim()) return null

  const { blocks } = parseMarkdown(source) as { blocks: Block[] }

  return (
    <>
      {blocks.map((block, index) => {
        const key = `${block.type}-${index}`

        if (block.type === 'h2' || block.type === 'h3') {
          const Tag = block.type
          return (
            <Tag
              key={key}
              id={block.id}
              className={
                block.type === 'h2'
                  ? 'scroll-mt-[100px] pt-[10px] font-cn text-[24px] font-bold leading-[1.4] text-[var(--color-ink)]'
                  : 'scroll-mt-[100px] pt-[4px] font-cn text-[18px] font-bold leading-[1.5] text-[var(--color-ink)]'
              }
            >
              {block.text}
            </Tag>
          )
        }

        if (block.type === 'p') {
          return (
            <p key={key} className="font-cn text-[16px] leading-[1.95] text-[var(--color-ink-2)]">
              {inline(block.text ?? '')}
            </p>
          )
        }

        if (block.type === 'code') {
          return (
            <pre
              key={key}
              className="overflow-x-auto rounded-[14px] border border-[var(--color-line)] bg-[#FBF8F4] p-[22px]"
            >
              <code className="font-code text-[13px] leading-[1.9] text-[var(--color-ink)]">
                {block.text}
              </code>
            </pre>
          )
        }

        if (block.type === 'quote') {
          return (
            <blockquote
              key={key}
              className="rounded-r-[12px] border-l-[3px] border-[var(--color-primary)] bg-[var(--color-primary-soft)] px-[22px] py-[20px]"
            >
              <p className="font-cn text-[16px] leading-[1.85] text-[var(--color-ink)]">
                {inline(block.text ?? '')}
              </p>
            </blockquote>
          )
        }

        // 列表：有序用数字圆标，无序用小圆点，沿用原来的两种排版
        if (block.type === 'ol') {
          return (
            <ol key={key} className="flex flex-col gap-[14px]">
              {(block.items ?? []).map((item, itemIndex) => (
                <li
                  key={itemIndex}
                  className="flex items-start gap-[14px] rounded-[14px] border border-[var(--color-line)] bg-[var(--color-bg-warm)] p-[18px]"
                >
                  <span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full bg-[var(--color-primary)] font-latin text-[12px] font-bold leading-none text-white">
                    {itemIndex + 1}
                  </span>
                  <span className="font-cn text-[14px] leading-[1.85] text-[var(--color-ink-2)]">
                    {inline(item)}
                  </span>
                </li>
              ))}
            </ol>
          )
        }

        return (
          <ul key={key} className="flex flex-col gap-[10px]">
            {(block.items ?? []).map((item, itemIndex) => (
              <li key={itemIndex} className="flex items-start gap-[10px]">
                <span className="mt-[10px] block h-[5px] w-[5px] shrink-0 rounded-full bg-[var(--color-primary)]" />
                <span className="font-cn text-[15px] leading-[1.9] text-[var(--color-ink-2)]">
                  {inline(item)}
                </span>
              </li>
            ))}
          </ul>
        )
      })}
    </>
  )
}
