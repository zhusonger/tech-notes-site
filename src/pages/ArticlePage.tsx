import type { ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Container } from '../components/Container'
import { ChevronRightIcon } from '../components/Icons'
import { useArticle } from '../data/SiteContent'
import { MarkdownBody } from '../lib/markdown'

/**
 * 文章页。
 *
 * 正文、目录、上下篇、相关文章全部来自接口（`GET /api/content/posts/:slug`），
 * 由 `shared/derive.mjs` 从文章本身派生 —— 不再有写死的目录锚点，
 * 也不再有「任何 slug 都显示同一篇文章」这种情况。
 *
 * 四种状态必须分开处理，混在一起就会互相冒充：
 *   - 取不到且没有兜底 → 骨架屏（还在取）
 *   - 服务端说没有     → 「没有这篇文章」（未发布或从未存在）
 *   - 取不到但兜底里有 → 显示兜底内容（顶部已有全局降级提示）
 *   - 取不到且兜底里没有 → 「暂时无法加载」，不能说成「不存在」
 */
export default function ArticlePage() {
  const { slug } = useParams<{ slug: string }>()
  const { post, status } = useArticle(slug)

  if (!post) {
    if (status === 'loading') {
      return (
        <Container className="py-24">
          <div className="mx-auto flex max-w-[720px] flex-col gap-5">
            <span className="h-[26px] w-[92px] animate-pulse rounded-full bg-[var(--color-bg-soft)]" />
            <span className="h-[38px] w-[86%] animate-pulse rounded-[10px] bg-[var(--color-bg-soft)]" />
            <span className="h-[16px] w-[60%] animate-pulse rounded-[6px] bg-[var(--color-bg-soft)]" />
            <span className="h-[220px] w-full animate-pulse rounded-[16px] bg-[var(--color-bg-soft)]" />
          </div>
        </Container>
      )
    }

    return (
      <ArticleNotice
        eyebrow={status === 'error' ? '加载失败' : '未找到'}
        title={status === 'error' ? '这篇内容暂时无法加载' : '没有这篇文章'}
        description={
          status === 'error'
            ? '内容服务没有响应，可能是网络或服务端故障；稍后重试即可，文章本身没有丢。'
            : '它可能已被移入草稿或删除，也可能是链接写错了。'
        }
        action={
          status === 'error' ? (
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex h-[42px] items-center rounded-full bg-[var(--color-primary)] px-[22px] font-cn text-[14px] font-medium leading-none text-white transition-colors hover:bg-[var(--color-primary-deep)]"
            >
              重新加载
            </button>
          ) : (
            <Link
              to="/blog"
              className="inline-flex h-[42px] items-center rounded-full bg-[var(--color-primary)] px-[22px] font-cn text-[14px] font-medium leading-none text-white transition-colors hover:bg-[var(--color-primary-deep)]"
            >
              返回文章列表
            </Link>
          )
        }
      />
    )
  }

  const meta = [post.dateLabel, post.viewsLabel, post.readingLabel].filter(Boolean).join(' · ')
  const hasAside = post.toc.length > 0 || post.related.length > 0

  return (
    <article className="border-b border-[var(--color-line)]">
      {/* 文章头部 */}
      <div className="border-b border-[var(--color-line)] bg-[var(--color-bg-warm)]">
        <Container className="flex flex-col gap-6 py-14 lg:py-16">
          <nav className="flex flex-wrap items-center gap-[8px] font-cn text-[13px] leading-none text-[var(--color-ink-3)]">
            <Link to="/" className="transition-colors hover:text-[var(--color-primary)]">
              {post.breadcrumb[0]}
            </Link>
            <ChevronRightIcon className="h-[13px] w-[13px]" />
            <Link to="/blog" className="transition-colors hover:text-[var(--color-primary)]">
              {post.breadcrumb[1]}
            </Link>
            <ChevronRightIcon className="h-[13px] w-[13px]" />
            <span className="text-[var(--color-ink-2)]">{post.breadcrumb[2]}</span>
          </nav>

          <span className="inline-flex w-fit items-center rounded-full bg-[var(--color-primary-soft)] px-[14px] py-[7px] font-cn text-[13px] leading-none text-[var(--color-primary)]">
            {post.category || '未分类'}
          </span>

          <h1 className="max-w-[820px] font-cn text-[30px] font-bold leading-[1.3] text-[var(--color-ink)] md:text-[40px]">
            {post.title}
          </h1>
          {post.excerpt ? (
            <p className="max-w-[720px] font-cn text-[16px] leading-[1.8] text-[var(--color-ink-2)]">
              {post.excerpt}
            </p>
          ) : null}

          <div className="flex items-center gap-[12px] pt-[6px]">
            <img
              src={post.author.avatar}
              alt={post.author.name}
              className="h-[42px] w-[42px] rounded-full object-cover"
            />
            <div className="flex flex-col gap-[4px]">
              <span className="font-cn text-[14px] font-medium leading-none text-[var(--color-ink)]">
                {post.author.name}
              </span>
              <span className="font-latin text-[12px] leading-none text-[var(--color-ink-3)]">
                {meta}
              </span>
            </div>
          </div>
        </Container>
      </div>

      {/* 封面 */}
      {post.image ? (
        <Container className="py-10">
          <div className="overflow-hidden rounded-[20px] border border-[var(--color-line)]">
            <img
              src={post.image}
              alt={post.title}
              className="h-[260px] w-full object-cover md:h-[420px]"
            />
          </div>
        </Container>
      ) : null}

      {/* 正文 + 侧栏 */}
      <Container
        className={[
          'grid grid-cols-1 gap-14 pb-16 lg:gap-16',
          /*
           * 没有封面时补上与「有封面」同档的上间距（py-10 = 40px）。
           * 有封面时这段间距由封面容器自己提供；封面不渲染时若不补，正文会直接
           * 顶着页头的分隔线 —— 同一篇文章配不配图，版式就成了两种。
           */
          post.image ? '' : 'pt-10',
          hasAside ? 'lg:grid-cols-[minmax(0,1fr)_340px]' : '',
        ].join(' ')}
      >
        <div className="flex flex-col gap-[22px]">
          {post.body.trim() ? (
            <MarkdownBody source={post.body} />
          ) : (
            /* 正文还没写就说还没写：这里曾经把另一篇文章的内容顶上来显示，属于假内容 */
            <div className="rounded-[16px] border border-dashed border-[var(--color-line)] bg-[var(--color-bg-warm)] p-[24px]">
              <p className="font-cn text-[15px] font-medium leading-none text-[var(--color-ink)]">
                这篇的正文尚未撰写
              </p>
              <p className="mt-[10px] font-cn text-[14px] leading-[1.85] text-[var(--color-ink-2)]">
                它在文章列表里已发布，但正文还是空的。等写完自然会出现在这里。
              </p>
            </div>
          )}

          {/* 标签：分类决定归档，标签决定关键词，两者都来自后台 */}
          {post.tags.length > 0 ? (
            <div className="flex flex-wrap items-center gap-[8px] border-t border-[var(--color-line)] pt-[22px]">
              <span className="font-cn text-[13px] leading-none text-[var(--color-ink-3)]">标签</span>
              {post.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full border border-[var(--color-line)] bg-[var(--color-bg-warm)] px-[12px] py-[6px] font-cn text-[12px] leading-none text-[var(--color-ink-2)]"
                >
                  {tag}
                </span>
              ))}
            </div>
          ) : null}
        </div>

        {hasAside ? (
          <aside className="flex flex-col gap-[18px]">
            {post.toc.length > 0 ? (
              <div className="rounded-[16px] border border-[var(--color-line)] bg-[var(--color-bg-warm)] p-[22px]">
                <span className="font-cn text-[13px] leading-none text-[var(--color-ink-3)]">目录</span>
                <ul className="mt-[16px] flex flex-col gap-[12px]">
                  {post.toc.map((item) => (
                    <li key={item.id}>
                      <a
                        href={`#${encodeURIComponent(item.id)}`}
                        className="font-cn text-[14px] leading-[1.6] text-[var(--color-ink-2)] transition-colors hover:text-[var(--color-primary)]"
                      >
                        {item.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="rounded-[16px] border border-[var(--color-line)] bg-[var(--color-bg-warm)] p-[22px]">
              <div className="flex items-center gap-[12px]">
                <img
                  src={post.author.avatar}
                  alt={post.author.name}
                  className="h-[52px] w-[52px] rounded-full object-cover"
                />
                <div className="flex flex-col gap-[5px]">
                  <span className="font-cn text-[15px] font-bold leading-none text-[var(--color-ink)]">
                    {post.author.name}
                  </span>
                  <span className="font-cn text-[12px] leading-[1.5] text-[var(--color-primary)]">
                    {post.author.role}
                  </span>
                </div>
              </div>
              <p className="mt-[14px] font-cn text-[13px] leading-[1.8] text-[var(--color-ink-2)]">
                {post.author.bio}
              </p>
              <Link
                to="/#contact"
                className="mt-[16px] inline-flex h-[40px] w-full items-center justify-center rounded-full border border-[var(--color-line)] bg-[var(--color-bg)] font-cn text-[13px] font-medium leading-none text-[var(--color-ink)] transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
              >
                关注作者
              </Link>
            </div>

            {post.related.length > 0 ? (
              <div className="rounded-[16px] border border-[var(--color-line)] bg-[var(--color-bg-warm)] p-[22px]">
                <span className="font-cn text-[13px] leading-none text-[var(--color-ink-3)]">
                  相关文章
                </span>
                <ul className="mt-[16px] flex flex-col gap-[16px]">
                  {post.related.map((item) => (
                    <li key={item.slug}>
                      <Link to={`/blog/${item.slug}`} className="group flex flex-col gap-[6px]">
                        <span className="font-cn text-[14px] font-medium leading-[1.6] text-[var(--color-ink)] group-hover:text-[var(--color-primary)]">
                          {item.title}
                        </span>
                        <span className="font-latin text-[12px] leading-none text-[var(--color-ink-3)]">
                          {item.meta}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </aside>
        ) : null}
      </Container>

      {/* 上一篇 / 下一篇：两侧都不存在时整块不渲染 */}
      {post.prev || post.next ? (
        <Container className="pb-16">
          <div className="grid grid-cols-1 gap-[16px] border-t border-[var(--color-line)] pt-8 sm:grid-cols-2">
            {post.prev ? (
              <Link
                to={`/blog/${post.prev.slug}`}
                className="group flex flex-col gap-[8px] rounded-[16px] border border-[var(--color-line)] p-[22px] transition-colors hover:border-[var(--color-primary)]"
              >
                <span className="font-cn text-[13px] leading-none text-[var(--color-ink-3)]">
                  {post.prev.label}
                </span>
                <span className="font-cn text-[15px] font-medium leading-[1.5] text-[var(--color-ink)] group-hover:text-[var(--color-primary)]">
                  {post.prev.title}
                </span>
              </Link>
            ) : (
              <span />
            )}
            {post.next ? (
              <Link
                to={`/blog/${post.next.slug}`}
                className="group flex flex-col gap-[8px] rounded-[16px] border border-[var(--color-line)] p-[22px] transition-colors hover:border-[var(--color-primary)] sm:items-end sm:text-right"
              >
                <span className="font-cn text-[13px] leading-none text-[var(--color-ink-3)]">
                  {post.next.label}
                </span>
                <span className="font-cn text-[15px] font-medium leading-[1.5] text-[var(--color-ink)] group-hover:text-[var(--color-primary)]">
                  {post.next.title}
                </span>
              </Link>
            ) : null}
          </div>
        </Container>
      ) : null}
    </article>
  )
}

/** 文章级的兜底提示页：三种「没有正文」的状态共用一个外壳，文案各自不同。 */
function ArticleNotice({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string
  title: string
  description: string
  action: ReactNode
}) {
  return (
    <Container className="py-24">
      <div className="mx-auto flex max-w-[560px] flex-col items-start gap-[14px] rounded-[20px] border border-[var(--color-line)] bg-[var(--color-bg-warm)] p-[32px]">
        <span className="font-cn text-[13px] leading-none text-[var(--color-ink-3)]">{eyebrow}</span>
        <h1 className="font-cn text-[24px] font-bold leading-[1.4] text-[var(--color-ink)]">{title}</h1>
        <p className="font-cn text-[14px] leading-[1.85] text-[var(--color-ink-2)]">{description}</p>
        <div className="pt-[6px]">{action}</div>
      </div>
    </Container>
  )
}
