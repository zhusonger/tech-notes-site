/**
 * 文章列表。
 *
 * 筛选、排序、分页全部交给服务端：计数必须与当前库一致，在前端做本地过滤
 * 迟早会和服务端对不上（尤其是跨页删除之后）。
 *
 * 与画布的两处取舍：
 * - 画布的行高是 `fill_container`（8 行把卡片撑满），但那一套会让行高随「本屏有几篇」
 *   浮动。这里改为固定 62px（与骨架行同高，加载前后不跳）。
 * - 缩略图用封面图；没有封面时退回一个暖灰方块加文档图标，不占位成破图。
 */
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { adminDashboardCopy, adminPostsCopy as copy } from '../../data/admin'
import {
  ApiError,
  adminApi,
  type CategoryItem,
  type PostCounts,
  type PostFilterStatus,
  type PostListItem,
  type PostSortKey,
} from '../adminApi'
import { ArrowRightIcon, DocIcon, PencilIcon, TrashIcon, UndoIcon } from '../AdminIcons'
import {
  Chip,
  ChipCount,
  ConfirmDialog,
  ControlSelect,
  EmptyState,
  Notice,
  PageHeader,
  Pager,
  PostStatusBadge,
  RowMenu,
  SkeletonRows,
  Toolbar,
  type RowAction,
} from '../ui'

const TABS: readonly { key: PostFilterStatus; label: string }[] = [
  { key: 'all', label: copy.tabs.all },
  { key: 'published', label: copy.tabs.published },
  { key: 'draft', label: copy.tabs.draft },
  { key: 'trash', label: copy.tabs.trash },
]

const SORTS: readonly { key: PostSortKey; label: string }[] = [
  { key: 'updated', label: copy.sortOptions.updated },
  { key: 'created', label: copy.sortOptions.created },
  { key: 'views', label: copy.sortOptions.views },
]

const PER_PAGE = 8
const VIEW_FORMAT = new Intl.NumberFormat('en-US')

interface ListState {
  items: PostListItem[]
  counts: PostCounts
  page: number
  total: number
  totalPages: number
}

const EMPTY_STATE: ListState = {
  items: [],
  counts: { all: 0, published: 0, draft: 0, trash: 0 },
  page: 1,
  total: 0,
  totalPages: 1,
}

export default function AdminPosts() {
  const nav = useNavigate()
  const [status, setStatus] = useState<PostFilterStatus>('all')
  const [category, setCategory] = useState('all')
  const [sort, setSort] = useState<PostSortKey>('updated')
  const [page, setPage] = useState(1)

  const [data, setData] = useState<ListState>(EMPTY_STATE)
  const [categories, setCategories] = useState<CategoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState<number | null>(null)
  const [pendingRemove, setPendingRemove] = useState<PostListItem | null>(null)
  const [notice, setNotice] = useState('')

  const load = useCallback(
    async (signal?: { cancelled: boolean }) => {
      setLoading(true)
      setError('')
      try {
        const [list, cats] = await Promise.all([
          adminApi.posts({ status, category, sort, page, perPage: PER_PAGE }),
          adminApi.categories(),
        ])
        if (signal?.cancelled) return
        setData(list)
        setCategories(cats.items)
      } catch (err) {
        if (signal?.cancelled) return
        setError(err instanceof ApiError ? err.message : copy.error)
      } finally {
        if (!signal?.cancelled) setLoading(false)
      }
    },
    [status, category, sort, page]
  )

  useEffect(() => {
    const signal = { cancelled: false }
    void load(signal)
    return () => {
      signal.cancelled = true
    }
  }, [load])

  /** 切换筛选条件时回到第一页，否则会停在一个新条件下不存在的页码上。 */
  const changeFilter = (next: { status?: PostFilterStatus; category?: string; sort?: PostSortKey }) => {
    if (next.status !== undefined) setStatus(next.status)
    if (next.category !== undefined) setCategory(next.category)
    if (next.sort !== undefined) setSort(next.sort)
    setPage(1)
  }

  const setStatusOf = async (post: PostListItem, next: 'published' | 'draft' | 'trash') => {
    setBusyId(post.id)
    setNotice('')
    try {
      await adminApi.updatePostStatus(post.id, next)
      setNotice(
        next === 'trash'
          ? `《${post.title}》已移入回收站`
          : next === 'published'
            ? `《${post.title}》已发布`
            : `《${post.title}》已转为草稿`
      )
      await load()
    } catch (err) {
      setNotice(err instanceof ApiError ? err.message : '操作失败')
    } finally {
      setBusyId(null)
    }
  }

  const remove = async (post: PostListItem) => {
    setBusyId(post.id)
    setNotice('')
    try {
      await adminApi.deletePost(post.id)
      setNotice(`《${post.title}》已彻底删除`)
      await load()
    } catch (err) {
      setNotice(err instanceof ApiError ? err.message : '删除失败')
    } finally {
      setBusyId(null)
    }
  }

  const { counts } = data
  const summary = copy.summary
    .replace('{published}', String(counts.published))
    .replace('{draft}', String(counts.draft))
    .replace('{categories}', String(categories.length))

  return (
    <div className="flex min-h-full flex-col gap-[18px]">
      <PageHeader title={copy.title} subtitle={summary} />

      {/* ------------------------------------------------------------ 筛选条 */}
      <Toolbar
        left={
          <div className="flex items-center gap-[8px]" role="tablist" aria-label="按状态筛选">
            {TABS.map((tab) => (
              <Chip
                key={tab.key}
                active={tab.key === status}
                onClick={() => changeFilter({ status: tab.key })}
              >
                {tab.label} <ChipCount>{counts[tab.key]}</ChipCount>
              </Chip>
            ))}
          </div>
        }
        right={
          <>
            <ControlSelect
              ariaLabel={copy.filter.category}
              value={category}
              onChange={(v) => changeFilter({ category: v })}
              options={[
                { value: 'all', label: copy.filter.category },
                ...categories.map((c) => ({ value: c.name, label: c.name })),
              ]}
            />
            <ControlSelect
              ariaLabel={copy.filter.sort}
              value={sort}
              onChange={(v) => changeFilter({ sort: v as PostSortKey })}
              options={SORTS.map((s) => ({ value: s.key, label: s.label }))}
            />
          </>
        }
      />

      {error ? (
        <Notice tone="error">
          {error}
          <button type="button" onClick={() => void load()} className="ml-[8px] underline">
            {copy.retry}
          </button>
        </Notice>
      ) : null}
      {notice ? (
        <Notice tone="info" onClose={() => setNotice('')}>
          {notice}
        </Notice>
      ) : null}

      {/* ------------------------------------------------------------ 列表卡片 */}
      <section className="flex min-h-[320px] flex-1 flex-col rounded-[16px] border border-[var(--color-line)] bg-[var(--admin-surface)]">
        <div className="flex items-center gap-[14px] px-[20px] pb-[12px] pt-[14px]">
          <span className="w-[40px] shrink-0" aria-hidden="true" />
          <span className="flex-1 font-cn text-[12px] font-medium text-[var(--color-ink-3)]">
            {copy.columns.title}
          </span>
          <span className="w-[78px] shrink-0 font-cn text-[12px] font-medium text-[var(--color-ink-3)]">
            {copy.columns.status}
          </span>
          <span className="w-[76px] shrink-0 font-cn text-[12px] font-medium text-[var(--color-ink-3)]">
            {copy.columns.views}
          </span>
          <span className="w-[108px] shrink-0 font-cn text-[12px] font-medium text-[var(--color-ink-3)]">
            {copy.columns.updated}
          </span>
          <span className="w-[24px] shrink-0" aria-hidden="true" />
        </div>
        <span className="h-px w-full bg-[var(--color-line)]" aria-hidden="true" />

        <div className="flex flex-1 flex-col">
          {loading && data.items.length === 0 ? (
            <SkeletonRows rows={6} height={62} />
          ) : data.items.length === 0 ? (
            <EmptyState title={copy.empty[status]} />
          ) : (
            data.items.map((post, i) => (
              <PostRow
                key={post.id}
                first={i === 0}
                post={post}
                busy={busyId === post.id}
                onEdit={() => nav(`/admin/posts/${post.id}`)}
                onPublish={() => void setStatusOf(post, 'published')}
                onUnpublish={() => void setStatusOf(post, 'draft')}
                onTrash={() => void setStatusOf(post, 'trash')}
                onRestore={() => void setStatusOf(post, 'draft')}
                onRemove={() => setPendingRemove(post)}
              />
            ))
          )}
        </div>

        <span className="h-px w-full bg-[var(--color-line-soft)]" aria-hidden="true" />
        <div className="flex items-center justify-between gap-[16px] px-[20px] py-[12px]">
          <span className="font-cn text-[11.5px] text-[var(--color-ink-3)]">
            {copy.footer.summary
              .replace('{total}', String(counts.all))
              .replace('{published}', String(counts.published))
              .replace('{draft}', String(counts.draft))}
            {status !== 'all' || category !== 'all'
              ? ` · ${copy.footer.filtered.replace('{label}', category === 'all' ? copy.tabs[status] : category).replace('{total}', String(data.total))}`
              : ''}
          </span>

          <Pager
            page={data.page}
            totalPages={data.totalPages}
            disabled={loading}
            onChange={setPage}
          />
        </div>
      </section>

      <ConfirmDialog
        open={Boolean(pendingRemove)}
        title={copy.rowMenu.remove}
        tone="danger"
        busy={busyId === pendingRemove?.id}
        confirmLabel={copy.rowMenu.remove}
        message={copy.confirmDelete.replace('{title}', pendingRemove?.title ?? '')}
        onCancel={() => setPendingRemove(null)}
        onConfirm={() => {
          const post = pendingRemove
          setPendingRemove(null)
          if (post) void remove(post)
        }}
      />
    </div>
  )
}

/* ------------------------------------------------------------------ 子组件 */

/*
 * 行高固定 62px。
 *
 * 原先这里是 `flex-1`：每行去平分列表容器的高度，于是行高不由内容决定，
 * 而由「这一屏有几篇文章」决定 —— 满 8 条约 84px，只剩两篇时每行被抻成
 * 一条巨幅空白。改成固定值后，条目多少行高都不变。
 *
 * `shrink-0` 不能省：父级是纵向 flex，行数多到超出容器时，默认的
 * `flex-shrink: 1` 会把每行压扁 —— 那样「固定高度」只在条目少时成立，
 * 恰恰把问题翻到了另一头。
 * 分隔线做成行自身的 border-top，这样行就是列表容器的直接子元素。
 */
function PostRow({
  post,
  first,
  busy,
  onEdit,
  onPublish,
  onUnpublish,
  onTrash,
  onRestore,
  onRemove,
}: {
  post: PostListItem
  first: boolean
  busy: boolean
  onEdit: () => void
  onPublish: () => void
  onUnpublish: () => void
  onTrash: () => void
  onRestore: () => void
  onRemove: () => void
}) {
  const meta = [post.category || copy.uncategorized, post.readingTime].filter(Boolean).join(' · ')

  const actions: RowAction[] =
    post.status === 'published'
      ? [
          { key: 'edit', label: copy.rowMenu.edit, icon: <PencilIcon className="h-[14px] w-[14px]" />, onSelect: onEdit },
          { key: 'unpublish', label: copy.rowMenu.unpublish, icon: <UndoIcon className="h-[14px] w-[14px]" />, onSelect: onUnpublish },
          { key: 'trash', label: copy.rowMenu.trash, icon: <TrashIcon className="h-[14px] w-[14px]" />, onSelect: onTrash },
        ]
      : post.status === 'draft'
        ? [
            { key: 'edit', label: copy.rowMenu.edit, icon: <PencilIcon className="h-[14px] w-[14px]" />, onSelect: onEdit },
            { key: 'publish', label: copy.rowMenu.publish, icon: <ArrowRightIcon className="h-[14px] w-[14px]" />, onSelect: onPublish },
            { key: 'trash', label: copy.rowMenu.trash, icon: <TrashIcon className="h-[14px] w-[14px]" />, onSelect: onTrash },
          ]
        : [
            { key: 'restore', label: copy.rowMenu.restore, icon: <UndoIcon className="h-[14px] w-[14px]" />, onSelect: onRestore },
            { key: 'remove', label: copy.rowMenu.remove, icon: <TrashIcon className="h-[14px] w-[14px]" />, danger: true, onSelect: onRemove },
          ]

  return (
    <div
      className={[
        'flex h-[62px] shrink-0 items-center gap-[14px] px-[20px] transition-colors hover:bg-[var(--color-bg-soft)]',
        first ? '' : 'border-t border-[var(--color-line-soft)]',
        busy ? 'pointer-events-none opacity-60' : '',
      ].join(' ')}
    >
      <span className="flex h-[40px] w-[40px] shrink-0 items-center justify-center overflow-hidden rounded-[10px] bg-[#f6f1eb]">
        {post.coverImage ? (
          <img src={post.coverImage} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <DocIcon className="h-[16px] w-[16px] text-[var(--admin-placeholder)]" />
        )}
      </span>

      <div className="flex min-w-0 flex-1 flex-col gap-[4px]">
        <span className="truncate font-cn text-[13px] font-medium text-[var(--color-ink)]">
          {post.title || copy.untitled}
        </span>
        <span className="truncate font-cn text-[11.5px] text-[var(--color-ink-3)]">{meta}</span>
      </div>

      <span className="w-[78px] shrink-0">
        <PostStatusBadge status={post.status} labels={{ ...adminDashboardCopy.status, trash: copy.tabs.trash }} />
      </span>

      <span className="w-[76px] shrink-0 font-latin text-[12.5px] font-medium text-[#5a544e]">
        {post.views > 0 ? VIEW_FORMAT.format(post.views) : '—'}
      </span>

      <span className="w-[108px] shrink-0 font-cn text-[12px] text-[var(--color-ink-3)]">{post.updatedLabel}</span>

      <span className="w-[24px] shrink-0">
        <RowMenu actions={actions} label={`《${post.title}》操作`} />
      </span>
    </div>
  )
}
