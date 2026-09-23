import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ArticleCard } from '../components/ArticleCard'
import { Container } from '../components/Container'
import { ChevronRightIcon } from '../components/Icons'
import { PageHead } from '../components/PageHead'
import { useSiteContent } from '../data/SiteContent'

/** 每页篇数。分页是真的：条数不够一页时下面的分页条不渲染，而不是摆一排点不动的按钮。 */
const PAGE_SIZE = 6

export default function BlogPage() {
  const { content } = useSiteContent()
  const { posts, filters, stats } = content

  const [searchParams] = useSearchParams()
  const query = (searchParams.get('q') ?? '').trim().toLowerCase()
  const [activeFilter, setActiveFilter] = useState(filters.blog[0])
  const [page, setPage] = useState(1)

  const visiblePosts = useMemo(() => {
    return posts.filter((post) => {
      const matchesFilter = activeFilter === filters.blog[0] || post.category === activeFilter
      const matchesQuery =
        query.length === 0 ||
        post.title.toLowerCase().includes(query) ||
        post.excerpt.toLowerCase().includes(query) ||
        post.category.toLowerCase().includes(query)
      return matchesFilter && matchesQuery
    })
  }, [posts, filters, activeFilter, query])

  // 换分类或换搜索词后留在原页码会落到空页上，统一回到第一页
  useEffect(() => {
    setPage(1)
  }, [activeFilter, query])

  const totalPages = Math.max(1, Math.ceil(visiblePosts.length / PAGE_SIZE))
  // 越界页码收敛到最后一页，而不是渲染一个空列表（与后台文章列表同一口径）
  const currentPage = Math.min(Math.max(page, 1), totalPages)
  const pagePosts = visiblePosts.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  return (
    <>
      <PageHead
        eyebrow="全部文章"
        title="技术笔记"
        description="从工具链到自托管，把踩过的坑写成可复用的经验。"
        stats={stats.blog}
      />

      <section className="py-14 lg:py-16">
        <Container className="flex flex-col gap-10">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-[10px]">
              {filters.blog.map((filter) => {
                const active = filter === activeFilter
                return (
                  <button
                    key={filter}
                    type="button"
                    onClick={() => setActiveFilter(filter)}
                    className={[
                      'inline-flex items-center rounded-full px-[14px] py-[7px] font-cn text-[13px] leading-none transition-colors',
                      active
                        ? 'bg-[var(--color-primary)] text-white'
                        : 'border border-[var(--color-line)] bg-[var(--color-bg-warm)] text-[var(--color-ink-2)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]',
                    ].join(' ')}
                  >
                    {filter}
                  </button>
                )
              })}
            </div>
            <span className="font-cn text-[13px] leading-none text-[var(--color-ink-3)]">
              {query ? `搜索「${searchParams.get('q')}」 · ` : ''}最新发布
            </span>
          </div>

          {visiblePosts.length > 0 ? (
            <div className="grid grid-cols-1 gap-[22px] sm:grid-cols-2 lg:grid-cols-3">
              {pagePosts.map((post) => (
                <ArticleCard key={post.id} post={post} />
              ))}
            </div>
          ) : (
            <p className="rounded-[16px] border border-dashed border-[var(--color-line)] bg-[var(--color-bg-warm)] px-[24px] py-[40px] text-center font-cn text-[14px] text-[var(--color-ink-3)]">
              没有匹配的文章，换个关键词或分类试试。
            </p>
          )}

          {totalPages > 1 ? (
            <div className="flex items-center justify-center gap-[10px] pt-[6px]">
              <button
                type="button"
                onClick={() => setPage(currentPage - 1)}
                disabled={currentPage === 1}
                className="inline-flex items-center gap-[6px] rounded-full border border-[var(--color-line)] px-[16px] py-[9px] font-cn text-[13px] leading-none text-[var(--color-ink-2)] transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] disabled:cursor-not-allowed disabled:text-[var(--color-ink-3)] disabled:hover:border-[var(--color-line)] disabled:hover:text-[var(--color-ink-3)]"
              >
                <ChevronRightIcon className="h-[14px] w-[14px] rotate-180" />
                上一页
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setPage(item)}
                  aria-current={item === currentPage ? 'page' : undefined}
                  className={[
                    'h-[36px] w-[36px] rounded-full font-latin text-[13px] leading-none transition-colors',
                    item === currentPage
                      ? 'bg-[var(--color-primary)] text-white'
                      : 'border border-[var(--color-line)] text-[var(--color-ink-2)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]',
                  ].join(' ')}
                >
                  {item}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setPage(currentPage + 1)}
                disabled={currentPage === totalPages}
                className="inline-flex items-center gap-[6px] rounded-full border border-[var(--color-line)] px-[16px] py-[9px] font-cn text-[13px] leading-none text-[var(--color-ink-2)] transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] disabled:cursor-not-allowed disabled:text-[var(--color-ink-3)] disabled:hover:border-[var(--color-line)] disabled:hover:text-[var(--color-ink-3)]"
              >
                下一页
                <ChevronRightIcon className="h-[14px] w-[14px]" />
              </button>
            </div>
          ) : null}
        </Container>
      </section>
    </>
  )
}
