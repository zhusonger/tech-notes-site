import { Link } from 'react-router-dom'
import type { PostItem } from '../data/site'
import { Chip } from './Chip'

/**
 * 没有配图时的默认封面。
 *
 * 卡片上的封面位是**固定高度**的（列表卡 198、首页条目 86），所以「没有图」并不会
 * 让条目变矮，只会留下一个灰块 —— 而 `src=""` 更糟：浏览器会画成破图图标外加一段
 * alt 文字。留空不是「什么都没有」，是「一张坏掉的图」。这里换成一张中性的默认封面，
 * 让没配图的文章看起来仍是正常条目。资源见 `public/images/cover-default.svg`。
 *
 * 只在卡片上用，文章详情页不分发它：详情页的封面是 420px 高的大图，
 * 给每篇没配图的文章都铺一张占位大图会盖过正文，那一页宁可不要封面。
 */
const DEFAULT_COVER = '/images/cover-default.svg'

interface ArticleCardProps {
  post: PostItem
  /** row：首页列表形态（缩略图在左）；card：博客列表网格形态（缩略图在上） */
  layout?: 'row' | 'card'
  showCategory?: boolean
}

export function ArticleCard({ post, layout = 'card', showCategory = true }: ArticleCardProps) {
  // 展示串（'2026.08.24' / '1.8k 阅读'）由服务端与兜底共用的呈现函数统一生成，这里只拼接。
  // 只有行式条目（首页）把两段拼成一行；卡片式（博客列表）按画布 3:465 分列两端。
  const meta = `${post.dateLabel} · ${post.viewsLabel}`

  if (layout === 'row') {
    return (
      <Link
        to={`/blog/${post.slug}`}
        className="group flex gap-[18px] rounded-[14px] border border-[var(--color-line)] bg-[var(--color-bg)] p-[14px] transition-colors hover:border-[var(--color-primary)]"
      >
        <div className="h-[86px] w-[118px] shrink-0 overflow-hidden rounded-[10px] bg-[var(--color-bg-soft)]">
          <img
            src={post.image || DEFAULT_COVER}
            alt={post.title}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
          />
        </div>
        <div className="flex min-w-0 flex-col justify-center gap-[8px]">
          <h3 className="font-cn text-[16px] font-medium leading-[1.45] text-[var(--color-ink)] group-hover:text-[var(--color-primary)]">
            {post.title}
          </h3>
          <p className="truncate font-cn text-[13px] leading-[1.6] text-[var(--color-ink-3)]">
            {post.excerpt}
          </p>
          {/* 同上：挪到后面，有分类与无分类时标题、摘要的起始位置才会一致 */}
          {showCategory && post.category ? <Chip>{post.category}</Chip> : null}
          {/* 行式条目的元信息是一个整体文本节点（画布 3:342，Inter 11px） */}
          <p className="font-latin text-[11px] leading-none text-[var(--color-ink-4)]">{meta}</p>
        </div>
      </Link>
    )
  }

  return (
    <Link
      to={`/blog/${post.slug}`}
      className="group flex flex-col overflow-hidden rounded-[16px] border border-[var(--color-line)] bg-[var(--color-bg)] transition-colors hover:border-[var(--color-primary)]"
    >
      <div className="h-[198px] w-full overflow-hidden bg-[var(--color-bg-soft)]">
        <img
          src={post.image || DEFAULT_COVER}
          alt={post.title}
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
        />
      </div>
      <div className="flex flex-1 flex-col gap-[12px] p-[22px]">
        <h3 className="font-cn text-[18px] font-medium leading-[1.45] text-[var(--color-ink)] group-hover:text-[var(--color-primary)]">
          {post.title}
        </h3>
        <p className="font-cn text-[14px] leading-[1.7] text-[var(--color-ink-2)]">{post.excerpt}</p>
        {/*
         * 分类放在标题与摘要**之后**：有无不定，摆在前面的代价是把标题、摘要整体推下
         * 一行 —— 同一行里几张卡的标题基线就对不齐，无分类的那张会往上冒。
         * 挪到后面，标题与摘要的位置就不再受它影响（这才是「有标签无标签保持一致」）。
         * 分类为空时整块不画：无条件渲染会留下一个**没有字的背景块**，比没有分类更像坏控件。
         */}
        {showCategory && post.category ? <Chip>{post.category}</Chip> : null}
        {/* 日期靠左、阅读量靠右：画布 3:465 的 Meta Row 是 SPACE_BETWEEN */}
        <div className="mt-auto flex items-center justify-between pt-[4px] text-[11.5px] leading-none text-[var(--color-ink-4)]">
          <span className="font-latin">{post.dateLabel}</span>
          <span className="font-cn">{post.viewsLabel}</span>
        </div>
      </div>
    </Link>
  )
}
