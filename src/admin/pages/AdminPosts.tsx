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
 *
 * 多选批量（画布上没有）：选中范围**限于当前页**，见 `ui.tsx` 的 `usePageSelection`。
 * 两个动作里「移入回收站」是幂等的，「彻底删除」只对回收站里开放 —— 准入与单条
 * 完全同源，所以这里既不预先禁用任何一个动作，也不在弹层里复述逐条理由：
 * 确认弹层只给**数量**（真正会动几篇、会跳过几篇），逐条理由由服务端在操作后回带。
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { adminDashboardCopy, adminPostsCopy as copy } from '../../data/admin'
import {
  ApiError,
  adminApi,
  type BulkSkipped,
  type CategoryItem,
  type PostBulkAction,
  type PostCounts,
  type PostFilterStatus,
  type PostListItem,
  type PostSortKey,
  type PostStatus,
} from '../adminApi'
import { ArrowRightIcon, DocIcon, PencilIcon, TrashIcon, UndoIcon } from '../AdminIcons'
import {
  Button,
  Checkbox,
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
  SelectionBar,
  SkeletonRows,
  Toolbar,
  useSelection,
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

/** 批量动作按钮的图标。与行菜单里同名动作用的是同一个图标 —— 同名不同图会很别扭。 */
const BULK_ICON: Record<PostBulkAction, (props: { className?: string }) => ReactNode> = {
  publish: ArrowRightIcon,
  unpublish: UndoIcon,
  trash: TrashIcon,
  restore: UndoIcon,
  delete: TrashIcon,
}

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
  /** 批量：待确认的动作 + 回执里那张「被跳过」清单（清单来自服务端，前端不自己编） */
  const [bulk, setBulk] = useState<PostBulkAction | null>(null)
  const [bulkBusy, setBulkBusy] = useState(false)
  const [bulkSkipped, setBulkSkipped] = useState<BulkSkipped[]>([])

  /**
   * 选中范围有两种，见 `useSelection`：`page` 是本页勾的那几条，
   * `all` 是「符合当前筛选的全部 N 篇」（跨页）。
   *
   * `pageIds` 用 `data.items` 而不是分页后的切片 —— 文章列表的分页在服务端，
   * 这一屏拿到的 8 条就是当前页，不存在「拿到全量再切」这一步。
   *
   * `filter` 的形状必须与服务端 `postScope()` 读的一致（status / category）：
   * 全选送过去的就是这两个条件，服务端按同一个函数换算，所以「屏幕上显示几篇」
   * 与「全选处理几篇」是不可能有出入的。
   */
  const pageIds = useMemo(() => data.items.map((p) => p.id), [data.items])
  const sel = useSelection({ pageIds, total: data.total, filter: { status, category } })

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

  /* ------------------------------------------------------------- 批量 */

  /*
   * 某个动作对某篇文章**是否成立**。
   *
   * 这份判定与服务端 `posts/bulk` 里逐条跳过用的条件是一对一的抽象，
   * 但它的用途是**决定按钮要不要出现**，不是替服务端做决定 —— 真正执行时
   * 服务端还会自己再判一遍（翻开 `readBulkPayload` 后面的那段循环就能看到）。
   * 前端这份只说「至少有一篇可能动得了才把按钮摆出来」。
   */
  const applies = (s: PostStatus, action: PostBulkAction) =>
    action === 'publish'
      ? s === 'draft'
      : action === 'unpublish'
        ? s === 'published'
        : action === 'trash'
          ? s !== 'trash'
          : action === 'restore'
            ? s === 'trash'
            : s === 'trash'

  /*
   * 这批选中里**存在哪些状态**。
   *
   * `all` 模式下知道了「筛选的是哪个页签」，整批的状态其实是确定的 ——
   * 回收站页签下全是 trash，所以 restore 与 delete 是精确的；只有「全部」页签
   * 下才需要靠本页这 8 条去推。推得不全不会造成错处：不符合的会被服务端跳过，
   * 但可能会少给一两个按钮。与其为了「一个都不漏」把五个动作常年摆满、让每次
   * 选择都像在一排无关按钮里找，不如承认这个限制。
   */
  const poolStatuses: PostStatus[] = sel.mode === 'all'
    ? status !== 'all'
      ? [status]
      : data.items.map((p) => p.status)
    : data.items.filter((p) => sel.has(p.id)).map((p) => p.status)

  /** 界面上按「至少有一条用得上」来决定给不给这个按钮 */
  const bulkActions = useMemo(() => {
    const order: PostBulkAction[] = ['publish', 'unpublish', 'trash', 'restore', 'delete']
    return order.filter((action) => poolStatuses.some((s) => applies(s, action)))
  }, [poolStatuses.join(',')])

  /** 本页显式勾中的那几篇（只有 page 模式需要它，`all` 模式的账由服务端算） */
  const bulkSelected = useMemo(() => data.items.filter((p) => sel.has(p.id)), [data.items, sel.mode, sel.count])

  /*
   * 预告「会动几篇」。只有本页模式（以及 all 模式恰好筛选了某个页签）才数得准，
   * 数不准时是 `null` —— 弹层那时**不给数量**，而不是给一个看着精确其实不准的数。
   * 执行完会怎样，一律以服务端回的 `affected` / `skipped` 为准。
   */
  const readyCount = bulk
    ? sel.mode === 'all'
      ? status !== 'all'
        ? sel.count
        : null
      : bulkSelected.filter((p) => applies(p.status, bulk)).length
    : 0
  const bulkHeld = bulk && readyCount !== null ? Math.max(sel.count - readyCount, 0) : 0

  const runBulk = async () => {
    if (!bulk) return
    setBulkBusy(true)
    setNotice('')
    setBulkSkipped([])
    try {
      const res = await adminApi.bulkPosts(sel.scope(), bulk)
      setNotice(
        res.affected
          ? (res.skipped.length ? copy.bulk.doneWithSkips : copy.bulk.done)
              .replace('{done}', String(res.affected))
              .replace('{skipped}', String(res.skipped.length))
          : copy.bulk.none
      )
      setBulkSkipped(res.skipped)
      setBulk(null)
      sel.clear()
      await load()
    } catch (err) {
      if (err instanceof ApiError) {
        setNotice(err.message)
        /*
         * 409 是「服务端算出的集合与界面上兜 count 的那批对不上」。这通常意味着
         * 列表已经变了，所以除了要把话说清楚，还要**立刻重取** ——
         * 否则界面会停在一个过时的名单上，让人对着旧数字再来一次。
         */
        if (err.status === 409) await load()
      } else {
        setNotice(copy.bulk.failed)
      }
    } finally {
      setBulkBusy(false)
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
      {/*
        被跳过的条目逐条摆出来。理由全部来自服务端回的 `skipped` —— 前端不复述
        「为什么跳过」的规则，因为那是判定的一部分，抄一份就多一个会说岔的地方。
      */}
      {bulkSkipped.length ? (
        <Notice tone="warn" onClose={() => setBulkSkipped([])}>
          <span className="flex flex-col gap-[5px]">
            <span>{copy.bulk.skipped.replace('{n}', String(bulkSkipped.length))}</span>
            {bulkSkipped.map((s) => (
              <span key={s.id} className="text-[11.5px]">
                · {s.label}
                <span className="opacity-75"> · {s.reason}</span>
              </span>
            ))}
          </span>
        </Notice>
      ) : null}

      {/* 批量操作条：选中项非空才出现，位置在筛选条与列表之间 —— 筛选条要继续可见，
          否则你不知道自己是在哪个筛选下选的这几篇 */}
      {sel.count > 0 ? (
        <SelectionBar
          count={sel.count}
          label={copy.bulk.selected}
          clearLabel={copy.bulk.clear}
          onClear={sel.clear}
          /* 「含其他页」这句话只在跨页全选时出现：条数是唯一的凭据，
             而它指的东西在这两种范围下完全不同，必须说清 */
          hint={sel.mode === 'all' ? copy.bulk.allScopeHint : undefined}
          lead={
            sel.mode === 'page' && data.total > data.items.length ? (
              <button
                type="button"
                onClick={sel.selectAllFiltered}
                className="font-cn text-[12px] leading-none text-[var(--color-primary)] underline-offset-2 hover:underline"
              >
                {copy.bulk.selectAllFiltered.replace('{n}', String(data.total))}
              </button>
            ) : sel.mode === 'all' ? (
              <button
                type="button"
                onClick={sel.clear}
                className="font-cn text-[12px] leading-none text-[var(--color-primary)] underline-offset-2 hover:underline"
              >
                {copy.bulk.exitAllScope}
              </button>
            ) : undefined
          }
          actions={
            <>
              {bulkActions.map((action) => {
                /* 图标跟着动作走，而不是全用垃圾桶：一排按钮靠形状区分位置时，
                   五个一模一样的图标会把「哪一个删得干净」这个问题变得难以回答。
                   组件要先取出来再用 —— JSX 标签名不接受带方括号的成员表达式。 */
                const Icon = BULK_ICON[action]
                return (
                  <Button
                    key={action}
                    variant={action === 'delete' ? 'danger' : 'outline'}
                    size="sm"
                    icon={<Icon className="h-[13px] w-[13px]" />}
                    onClick={() => setBulk(action)}
                  >
                    {copy.bulk.actions[action].label}
                  </Button>
                )
              })}
            </>
          }
        />
      ) : null}

      {/* ------------------------------------------------------------ 列表卡片 */}
      <section className="flex min-h-[320px] flex-1 flex-col rounded-[16px] border border-[var(--color-line)] bg-[var(--admin-surface)]">
        <div className="flex items-center gap-[14px] px-[20px] pb-[12px] pt-[14px]">
          {/* 表头这颗是全选（当前页）。行与表头两边的列宽必须逐列对齐，所以它是
              一条独立的 16px 列，不是叠在缩略图那一列上 */}
          <span className="w-[16px] shrink-0">
            <Checkbox
              checked={sel.allSelected}
              indeterminate={sel.partial}
              disabled={data.items.length === 0}
              onChange={() => sel.toggleAll()}
              label={copy.bulk.selectAll}
            />
          </span>
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
                selected={sel.has(post.id)}
                onToggle={(on) => sel.toggle(post.id, on)}
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

      {/*
        批量确认。
        标题里的数量是**真正会动的条数**，连同动作一起从 `bulk` 那个 key 取 ——
        五个动作共用这一个弹层，各自的标题、说明、跳过理由都在文案里成套放着，
        加一个新动作不必动这里的结构。
        一个都动不了时按钮是灰的：与其让人点下去收到一条「没有任何改动」，
        不如在能看清原因的地方就停住。
      */}
      <ConfirmDialog
        open={bulk !== null}
        tone={bulk === 'delete' ? 'danger' : 'default'}
        busy={bulkBusy}
        title={bulk ? copy.bulk.actions[bulk].title.replace('{n}', String(readyCount ?? sel.count)) : ''}
        confirmLabel={bulk ? copy.bulk.actions[bulk].label : ''}
        confirmDisabled={readyCount === 0}
        message={
          bulk ? (
            <span className="flex flex-col gap-[8px]">
              <span>{copy.bulk.actions[bulk].message}</span>
              {/* 数量数得准才给这句；数不准时不编一个精确的数字，让服务端事后结账 */}
              {bulkHeld > 0 ? (
                <span className="text-[var(--color-ink-3)]">
                  {copy.bulk.skipNote
                    .replace('{hint}', copy.bulk.actions[bulk].skipHint)
                    .replace('{n}', String(bulkHeld))}
                </span>
              ) : null}
            </span>
          ) : null
        }
        onConfirm={() => void runBulk()}
        onCancel={() => setBulk(null)}
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
  selected,
  onToggle,
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
  selected: boolean
  onToggle: (on: boolean) => void
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
        'flex h-[62px] shrink-0 items-center gap-[14px] px-[20px] transition-colors',
        selected ? 'bg-[var(--color-primary-soft)]' : 'hover:bg-[var(--color-bg-soft)]',
        first ? '' : 'border-t border-[var(--color-line-soft)]',
        busy ? 'pointer-events-none opacity-60' : '',
      ].join(' ')}
    >
      <span className="flex w-[16px] shrink-0 justify-center">
        <Checkbox
          checked={selected}
          onChange={onToggle}
          label={copy.bulk.selectRow.replace('{title}', post.title || copy.untitled)}
        />
      </span>

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
