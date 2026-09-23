/**
 * 分类与标签（设计稿 14 屏里的第 6 屏，画布 `13:1254`）。
 *
 * 一屏两栏：左边分类（可拖行排序），右边标签（回车即建）。两栏的形状不同，
 * 是因为它们背后的数据结构本来就不同 —— 这一屏几乎所有取舍都出自这一点：
 *
 * 1. **分类有顺序，所以能拖。** 顺序决定前台「博客」页筛选条的排列
 *    （`filters.blog` 就是按 `sort_order` 拼的），拖完前台真的会变。
 *    拖拽沿用项目卡片墙那套（pointer 事件 + 提交整份 id 顺序）。
 * 2. **标签按频次排，所以不能拖。** 频次是算出来的，不是摆出来的 ——
 *    给一个「点一下就能改顺序」的把手，等于让人去改一个由别的数据决定的量。
 *    画布上标签云最常用的那一条是高亮的，那就是这一栏唯一的「排序」。
 * 3. **删分类与删标签的代价不一样。** 分类名存在每一篇文章的 `posts.category` 里，
 *    删掉会让那些文章掉到「未分类」；标签走的是 `post_tags` 中间表，删了只是解绑。
 *    所以前者要先摆代价再确认，后者在画布的提示条里写明了「不会删除文章」。
 *
 * 画布上有、这里刻意没做的：
 *   - **分类的「编辑」**：分类只有名字一个可写字段，所以行菜单里就是「重命名」，
 *     不另开一个只放一个输入框的编辑页。
 *   - **标签的排序开关**：见上，频次排序是这一栏的定义，不是可选项。
 *
 * 另一个实现上的取舍：这一屏的两块面板**不用** `ui.tsx` 的 `AdminCard`。
 * 它带 `overflow-hidden`，而 `RowMenu` 是就地渲染的下拉 —— 卡片一裁，
 * 最后一行那颗「更多」点开就看不见了。
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { normalizeName } from '../../../shared/taxonomy.mjs'
import { adminTaxonomyCopy as copy } from '../../data/admin'
import {
  adminApi,
  ApiError,
  type CategoryItem,
  type MergeGroup,
  type TagItem,
  type TaxonomyResponse,
} from '../adminApi'
import { ArrowDownIcon, ArrowUpIcon, EyeIcon, PencilIcon, PlusIcon, TrashIcon, XIcon } from '../AdminIcons'
import {
  Button,
  ConfirmDialog,
  EmptyState,
  Field,
  HeaderButton,
  Modal,
  Notice,
  PageHeader,
  RowMenu,
  SkeletonRows,
  TextInput,
  type RowAction,
} from '../ui'

/**
 * 行首圆点的配色。
 *
 * 由名称哈希派生，只为**区分相邻两行**，不承载任何语义（画布上那几个颜色
 * 也不是一套分类体系）。哈希而不是下标：插入或重排之后，同一个分类的颜色不该变。
 */
const DOT_COLORS = ['#f26b1b', '#c98a4b', '#6e7a6a', '#b9713a', '#7d8a72', '#a8763f']
const DOT_EMPTY = '#ded8cf'

function dotColor(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i += 1) hash = (hash * 31 + name.charCodeAt(i)) % 9973
  return DOT_COLORS[hash % DOT_COLORS.length]
}

/** 面板白卡。刻意不带 `overflow-hidden`，理由见文件头。 */
function Panel({ className = '', children }: { className?: string; children: ReactNode }) {
  return (
    <section
      className={['rounded-[16px] border border-[var(--color-line)] bg-[var(--admin-surface)]', className].join(' ')}
    >
      {children}
    </section>
  )
}

/** 新建 / 重命名共用的那个单字段弹层。三处调用，字段与规则完全一样。 */
type DialogMode =
  | { mode: 'createCategory' }
  | { mode: 'renameCategory'; target: CategoryItem }
  | { mode: 'renameTag'; target: TagItem }

export default function AdminTaxonomy() {
  const [data, setData] = useState<TaxonomyResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [warn, setWarn] = useState('')
  const [busy, setBusy] = useState(false)

  const [dialog, setDialog] = useState<DialogMode | null>(null)
  const [pendingCategory, setPendingCategory] = useState<CategoryItem | null>(null)
  const [pendingTag, setPendingTag] = useState<TagItem | null>(null)
  const [pendingMerge, setPendingMerge] = useState(false)
  const [pendingPrune, setPendingPrune] = useState(false)

  const [selectedTagId, setSelectedTagId] = useState<number | null>(null)
  const [draft, setDraft] = useState('')

  /** 拖拽中的本地顺序。非空即表示「正在拖」——渲染与提交都以它为准。 */
  const [orderOverride, setOrderOverride] = useState<number[] | null>(null)
  const dragMovedRef = useRef(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setData(await adminApi.taxonomy())
      setError('')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : copy.loadError)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const categories = data?.categories ?? []
  const tags = data?.tags ?? []
  const counts = data?.counts
  const mergeGroups = data?.mergeGroups ?? []
  const unusedTags = useMemo(() => tags.filter((t) => t.postCount === 0), [tags])
  const selectedTag = useMemo(() => tags.find((t) => t.id === selectedTagId) ?? null, [tags, selectedTagId])

  /**
   * 输入时提示「已有相近的标签」。
   *
   * 用 `shared/taxonomy.mjs` 的归一化口径，与「合并重复标签」的判定同源。
   * 与已有标签**完全同名**时不提示：那种情况服务端会直接拒收并给出自己的话，
   * 这里再说一句就成了同一件事的两种说法。
   */
  const nearTag = useMemo(() => {
    const typed = draft.trim()
    const key = normalizeName(typed)
    if (!key) return null
    return tags.find((t) => normalizeName(t.name) === key && t.name !== typed) ?? null
  }, [draft, tags])

  const shown = useMemo(() => {
    if (!orderOverride) return categories
    const byId = new Map(categories.map((c) => [c.id, c]))
    return orderOverride.map((id) => byId.get(id)).filter((c): c is CategoryItem => Boolean(c))
  }, [categories, orderOverride])

  /* ------------------------------------------------------------- 分类排序 */

  const beginDrag = (e: React.PointerEvent, id: number) => {
    if (categories.length < 2) return
    e.preventDefault()

    const initial = categories.map((c) => c.id)
    if (!initial.includes(id)) return

    let working = initial
    dragMovedRef.current = false
    setOrderOverride(initial)

    const idAt = (x: number, y: number): number | null => {
      const host = (document.elementFromPoint(x, y) as HTMLElement | null)?.closest('[data-category-id]')
      const n = Number(host?.getAttribute('data-category-id') ?? NaN)
      return Number.isInteger(n) ? n : null
    }

    const onMove = (ev: PointerEvent) => {
      const overId = idAt(ev.clientX, ev.clientY)
      if (overId === null) return
      const from = working.indexOf(id)
      const to = working.indexOf(overId)
      if (from === -1 || to === -1 || from === to) return
      working = working.slice()
      working.splice(from, 1)
      working.splice(to, 0, id)
      dragMovedRef.current = true
      setOrderOverride(working)
    }

    const onUp = () => {
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
      document.removeEventListener('pointercancel', onUp)
      document.body.style.userSelect = ''
      if (!dragMovedRef.current) {
        setOrderOverride(null)
        return
      }
      void commitOrder(working)
    }

    /* 拖拽中禁掉文本选中：掠过行上的分类名会留下一片蓝色选区，看起来像「选中了这些分类」 */
    document.body.style.userSelect = 'none'
    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
    document.addEventListener('pointercancel', onUp)
  }

  /**
   * 提交新顺序。
   *
   * 失败时不去本地反向算回去，而是重取一次列表 —— 本地回滚要维护一份改动前的快照，
   * 快照一旦与库不一致，回滚出来的就是第三种顺序。这与项目卡片墙同一口径。
   */
  const commitOrder = async (next: number[]) => {
    setBusy(true)
    try {
      const res = await adminApi.reorderCategories(next)
      setData((d) => (d ? { ...d, categories: res.items } : d))
      setOrderOverride(null)
      setNotice(copy.reorderSaved.replace('{n}', String(next.length)))
    } catch (err) {
      setOrderOverride(null)
      await load()
      setWarn(`${copy.reorderError}（${err instanceof ApiError ? err.message : copy.error}）`)
    } finally {
      setBusy(false)
    }
  }

  /** 键盘可达的排序替代路径：行菜单里的上移 / 下移。拖拽不是唯一入口。 */
  const moveBy = async (id: number, delta: number) => {
    const ids = categories.map((c) => c.id)
    const from = ids.indexOf(id)
    const to = from + delta
    if (from === -1 || to < 0 || to >= ids.length) return
    const next = ids.slice()
    next.splice(from, 1)
    next.splice(to, 0, id)
    setOrderOverride(next)
    await commitOrder(next)
  }

  /* --------------------------------------------------------------- 写操作 */

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    setWarn('')
    setNotice('')
    try {
      await fn()
    } catch (err) {
      setWarn(err instanceof ApiError ? err.message : copy.error)
    } finally {
      setBusy(false)
    }
  }

  /** 弹层提交。失败时把消息抛回弹层，让它显示在输入框上方而不是页面顶部。 */
  const submitDialog = async (name: string) => {
    if (!dialog) return
    if (dialog.mode === 'createCategory') {
      const res = await adminApi.createCategory(name)
      setNotice(copy.created.replace('{name}', res.item.name))
    } else if (dialog.mode === 'renameCategory') {
      const res = await adminApi.renameCategory(dialog.target.id, name)
      setNotice(
        res.movedPosts
          ? copy.renamedMoved.replace('{name}', res.item.name).replace('{n}', String(res.movedPosts))
          : copy.renamed.replace('{name}', res.item.name)
      )
    } else {
      const res = await adminApi.renameTag(dialog.target.id, name)
      setNotice(copy.tagRenamed.replace('{name}', res.item.name))
    }
    setDialog(null)
    await load()
  }

  const removeCategory = async (c: CategoryItem) => {
    /* `postCount > 0` 才传 force。这个数来自列表，服务端那边仍会独立判一次 ——
       两边都判不算重复，服务端那道是防「列表过期后照着旧数删」。 */
    const res = await adminApi.deleteCategory(c.id, c.postCount > 0)
    setNotice(
      res.unbound
        ? copy.removedUnbound.replace('{name}', c.name).replace('{n}', String(res.unbound))
        : copy.removed.replace('{name}', c.name)
    )
    setPendingCategory(null)
    await load()
  }

  const removeTag = async (t: TagItem) => {
    const res = await adminApi.deleteTag(t.id)
    setNotice(
      res.unbound
        ? copy.tagRemovedUnbound.replace('{name}', t.name).replace('{n}', String(res.unbound))
        : copy.tagRemoved.replace('{name}', t.name)
    )
    setPendingTag(null)
    if (selectedTagId === t.id) setSelectedTagId(null)
    await load()
  }

  const submitTag = async () => {
    const name = draft.trim()
    if (!name) return
    setDraft('')
    await run(async () => {
      const res = await adminApi.createTag(name)
      setNotice(copy.tagCreated.replace('{name}', res.item.name))
      /* 新建的标签是 0 篇，一定落在标签云末尾 —— 选中它，让右侧立刻显示它的操作行 */
      setSelectedTagId(res.item.id)
      await load()
    })
  }

  const mergeTags = async () => {
    await run(async () => {
      const res = await adminApi.mergeTags()
      setNotice(
        res.merged
          ? copy.tagMerged.replace('{n}', String(res.merged)).replace('{n2}', String(res.movedPosts ?? 0))
          : copy.tagMergeNone
      )
      setPendingMerge(false)
      setSelectedTagId(null)
      await load()
    })
  }

  const pruneTags = async () => {
    await run(async () => {
      const res = await adminApi.pruneUnusedTags()
      setNotice(copy.tagPruned.replace('{n}', String(res.removed)))
      setPendingPrune(false)
      await load()
    })
  }

  /* ----------------------------------------------------------------- 渲染 */

  const categoryActions = (c: CategoryItem, index: number): RowAction[] => [
    {
      key: 'rename',
      label: copy.category.rowMenu.rename,
      icon: <PencilIcon className="h-[14px] w-[14px]" />,
      onSelect: () => setDialog({ mode: 'renameCategory', target: c }),
    },
    {
      key: 'up',
      label: copy.category.rowMenu.moveUp,
      icon: <ArrowUpIcon className="h-[14px] w-[14px]" />,
      disabled: index <= 0,
      onSelect: () => void moveBy(c.id, -1),
    },
    {
      key: 'down',
      label: copy.category.rowMenu.moveDown,
      icon: <ArrowDownIcon className="h-[14px] w-[14px]" />,
      disabled: index >= shown.length - 1,
      onSelect: () => void moveBy(c.id, 1),
    },
    {
      key: 'remove',
      label: copy.category.rowMenu.remove,
      icon: <TrashIcon className="h-[14px] w-[14px]" />,
      danger: true,
      onSelect: () => setPendingCategory(c),
    },
  ]

  return (
    <div className="flex min-h-full flex-col gap-[18px]">
      <PageHeader
        title={copy.title}
        subtitle={copy.subtitle}
        right={
          <HeaderButton
            icon={<EyeIcon className="h-[14px] w-[14px]" />}
            onClick={() => window.open('/blog', '_blank', 'noopener,noreferrer')}
          >
            {copy.previewSite}
          </HeaderButton>
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
      {warn ? (
        <Notice tone="warn" onClose={() => setWarn('')}>
          {warn}
        </Notice>
      ) : null}
      {notice ? (
        <Notice tone="success" onClose={() => setNotice('')}>
          {notice}
        </Notice>
      ) : null}

      <div className="flex min-h-[520px] flex-1 items-stretch gap-[20px]">
        {/* ---------------------------------------------------------- 左：分类 */}
        <Panel className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-start justify-between gap-[16px] px-[18px] py-[14px]">
            <div className="flex min-w-0 flex-col gap-[3px]">
              <h2 className="font-cn text-[13px] font-semibold leading-none text-[var(--color-ink)]">
                {copy.category.title}
              </h2>
              <p className="font-cn text-[10.5px] leading-[1.5] text-[var(--admin-placeholder)]">
                {copy.category.subtitle}
              </p>
            </div>
            <span className="shrink-0 rounded-[12px] bg-[var(--admin-soft)] px-[11px] py-[5px] font-cn text-[11px] leading-none text-[var(--color-ink-2)]">
              {copy.category.count.replace('{n}', String(counts?.categories ?? 0))}
            </span>
          </header>
          <div className="h-px bg-[var(--color-line)]" />

          <div className="flex items-center gap-[12px] bg-[var(--admin-soft)] px-[18px] py-[10px]">
            <span className="min-w-0 flex-1 font-cn text-[10.5px] font-medium leading-none text-[var(--color-ink-3)]">
              {copy.category.columns.name}
            </span>
            <span className="w-[70px] shrink-0 font-cn text-[10.5px] font-medium leading-none text-[var(--color-ink-3)]">
              {copy.category.columns.posts}
            </span>
            <span className="w-[24px] shrink-0" />
          </div>
          <div className="h-px bg-[var(--color-line)]" />

          {loading && !data ? (
            <SkeletonRows rows={5} height={46} />
          ) : shown.length === 0 ? (
            <EmptyState title={copy.category.empty} hint={copy.category.emptyHint} />
          ) : (
            <div>
              {shown.map((c, index) => (
                <div key={c.id}>
                  {index > 0 ? <div className="h-px bg-[var(--color-line)]" /> : null}
                  <CategoryRow
                    category={c}
                    actions={categoryActions(c, index)}
                    orderIndex={index}
                    total={shown.length}
                    dragging={Boolean(orderOverride)}
                    onDragStart={(e) => beginDrag(e, c.id)}
                  />
                </div>
              ))}
            </div>
          )}

          <div className="mt-auto h-px bg-[var(--color-line)]" />
          <footer className="flex flex-wrap items-center justify-between gap-[12px] px-[18px] py-[14px]">
            <span className="font-cn text-[11px] leading-[1.6] text-[var(--admin-placeholder)]">
              {copy.category.footer}
            </span>
            <button
              type="button"
              onClick={() => setDialog({ mode: 'createCategory' })}
              className="inline-flex items-center gap-[6px] rounded-[14px] bg-[var(--admin-soft)] px-[12px] py-[6px] font-cn text-[11.5px] font-medium leading-none text-[var(--color-primary)] transition-colors hover:bg-[var(--color-primary-soft)]"
            >
              <PlusIcon className="h-[11px] w-[11px]" />
              {copy.category.create}
            </button>
          </footer>
        </Panel>

        {/* ---------------------------------------------------------- 右：标签 */}
        <Panel className="flex w-[340px] shrink-0 flex-col">
          <header className="flex items-start justify-between gap-[12px] px-[18px] py-[14px]">
            <div className="flex min-w-0 flex-col gap-[3px]">
              <h2 className="font-cn text-[13px] font-semibold leading-none text-[var(--color-ink)]">
                {copy.tag.title}
              </h2>
              <p className="font-cn text-[10.5px] leading-[1.5] text-[var(--admin-placeholder)]">
                {copy.tag.subtitle.replace('{n}', String(counts?.tags ?? 0))}
              </p>
            </div>
            <RowMenu
              label={copy.tag.more}
              actions={[
                {
                  key: 'prune',
                  label: unusedTags.length
                    ? copy.tag.pruneSome.replace('{n}', String(unusedTags.length))
                    : copy.tag.prune,
                  icon: <TrashIcon className="h-[14px] w-[14px]" />,
                  disabled: unusedTags.length === 0,
                  /* 置灰时把原因写在 title 上：一个点不动的入口比一个消失的入口更需要解释 */
                  title: unusedTags.length === 0 ? copy.tag.pruneNone : undefined,
                  onSelect: () => setPendingPrune(true),
                },
              ]}
            />
          </header>
          <div className="h-px bg-[var(--color-line)]" />

          <div className="flex flex-1 flex-col gap-[14px] px-[16px] py-[16px]">
            <div className="flex items-center gap-[10px] rounded-[10px] border border-[var(--color-line)] bg-[var(--admin-surface)] px-[13px] py-[11px] transition-colors focus-within:border-[var(--color-primary)]">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    void submitTag()
                  }
                }}
                placeholder={copy.tag.inputPlaceholder}
                aria-label={copy.tag.inputCreate}
                className="min-w-0 flex-1 bg-transparent font-cn text-[12px] text-[var(--color-ink)] outline-none placeholder:text-[var(--admin-placeholder)]"
              />
              <button
                type="button"
                aria-label={copy.tag.inputCreate}
                disabled={!draft.trim() || busy}
                onClick={() => void submitTag()}
                className="shrink-0 font-cn text-[14px] leading-none text-[var(--color-primary)] transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
              >
                ＋
              </button>
            </div>

            {nearTag ? (
              <p className="font-cn text-[10.5px] leading-[1.6] text-[var(--admin-placeholder)]">
                {copy.tag.inputNear.replace('{name}', nearTag.name)}
              </p>
            ) : null}

            {tags.length === 0 && !loading ? (
              <p className="font-cn text-[11px] leading-[1.7] text-[var(--admin-placeholder)]">
                {copy.tag.empty} —— {copy.tag.emptyHint}
              </p>
            ) : (
              <div className="flex flex-wrap gap-[8px]">
                {tags.map((t) => (
                  <TagChip
                    key={t.id}
                    tag={t}
                    /* 最常用的那一条高亮（画布上「Android 12」那颗橙底就是这个意思）。
                       0 篇的标签不高亮：没有使用频次可排的时候，「第一名」是虚的。 */
                    top={t.postCount > 0 && t.id === tags[0].id}
                    active={t.id === selectedTagId}
                    onClick={() => setSelectedTagId((prev) => (prev === t.id ? null : t.id))}
                  />
                ))}
              </div>
            )}

            {/* 选中态的操作条。标签云里那颗胶囊本身没有更多菜单 —— 画布上它是干净的，
                操作放到这里，一次只针对一个标签，也就不会误删。 */}
            {selectedTag ? (
              <div className="flex flex-col gap-[8px] rounded-[12px] border border-[var(--color-primary)] bg-[#fff9f7] px-[13px] py-[10px]">
                <div className="flex items-start justify-between gap-[8px]">
                  <span className="min-w-0 flex-1 font-cn text-[11.5px] leading-[1.6] text-[var(--color-ink-2)]">
                    {copy.tag.selected.replace('{name}', selectedTag.name)}
                    <span className="text-[var(--color-ink-3)]">
                      {' · '}
                      {selectedTag.postCount
                        ? copy.tag.selectedUsage.replace('{n}', String(selectedTag.postCount))
                        : copy.tag.selectedUsageNone}
                    </span>
                  </span>
                  <button
                    type="button"
                    aria-label={copy.tag.selectedClear}
                    title={copy.tag.selectedClear}
                    onClick={() => setSelectedTagId(null)}
                    className="shrink-0 text-[var(--color-ink-3)] transition-colors hover:text-[var(--color-ink)]"
                  >
                    <XIcon className="h-[13px] w-[13px]" />
                  </button>
                </div>
                <div className="flex items-center gap-[14px]">
                  <button
                    type="button"
                    onClick={() => setDialog({ mode: 'renameTag', target: selectedTag })}
                    className="font-cn text-[11.5px] font-medium text-[var(--color-primary)] underline-offset-2 hover:underline"
                  >
                    {copy.tag.rename}
                  </button>
                  <button
                    type="button"
                    onClick={() => setPendingTag(selectedTag)}
                    className="font-cn text-[11.5px] font-medium text-[#b4460c] underline-offset-2 hover:underline"
                  >
                    {copy.tag.remove}
                  </button>
                </div>
              </div>
            ) : null}

            <div className="h-px bg-[var(--color-line)]" />

            <div className="rounded-[12px] bg-[var(--admin-soft)] px-[14px] py-[13px]">
              <p className="font-cn text-[10.5px] leading-[17px] text-[var(--color-ink-3)]">{copy.tag.tip}</p>
            </div>

            {/* 没有近重复时置灰并说明原因 —— 一个点下去只会弹「没有发现重复」的按钮，
                比灰着的按钮更让人以为坏了。 */}
            <Button
              variant="outline"
              size="sm"
              block
              className="rounded-[16px]"
              disabled={mergeGroups.length === 0 || busy}
              title={mergeGroups.length === 0 ? copy.tag.mergeNone : undefined}
              onClick={() => setPendingMerge(true)}
            >
              {copy.tag.merge}
            </Button>
          </div>
        </Panel>
      </div>

      {dialog ? (
        <NameDialog
          key={dialog.mode === 'createCategory' ? 'new' : `${dialog.mode}-${dialog.target.id}`}
          title={copy.dialog[dialog.mode].title}
          subtitle={copy.dialog[dialog.mode].subtitle}
          label={copy.dialog[dialog.mode].label}
          initial={dialog.mode === 'createCategory' ? '' : dialog.target.name}
          max={dialog.mode === 'renameTag' ? (data?.policy.tagNameMax ?? 0) : (data?.policy.categoryNameMax ?? 0)}
          onSubmit={submitDialog}
          onClose={() => setDialog(null)}
        />
      ) : null}

      <ConfirmDialog
        open={Boolean(pendingCategory)}
        tone="danger"
        busy={busy}
        title={copy.confirm.categoryTitle}
        confirmLabel={
          pendingCategory && pendingCategory.postCount > 0
            ? copy.confirm.categoryConfirmForce
            : copy.confirm.categoryConfirm
        }
        cancelLabel={copy.confirm.cancel}
        message={
          <span className="flex flex-col gap-[10px]">
            <span>{copy.confirm.categoryMessage}</span>
            {pendingCategory && pendingCategory.postCount > 0 ? (
              <>
                <span>
                  {copy.confirm.categoryUsed
                    .replace('{name}', pendingCategory.name)
                    .replace('{n}', String(pendingCategory.postCount))}
                </span>
                <span className="rounded-[10px] bg-[var(--admin-soft)] px-[12px] py-[10px]">
                  {copy.confirm.categoryUsedHint}
                </span>
              </>
            ) : null}
          </span>
        }
        onConfirm={() => pendingCategory && void run(() => removeCategory(pendingCategory))}
        onCancel={() => setPendingCategory(null)}
      />

      <ConfirmDialog
        open={Boolean(pendingTag)}
        tone="danger"
        busy={busy}
        title={copy.confirm.tagTitle}
        confirmLabel={copy.confirm.tagConfirm}
        cancelLabel={copy.confirm.cancel}
        message={
          <span className="flex flex-col gap-[10px]">
            <span>{copy.confirm.tagMessage}</span>
            {pendingTag && pendingTag.postCount > 0 ? (
              <span>
                {copy.confirm.tagUsed.replace('{name}', pendingTag.name).replace('{n}', String(pendingTag.postCount))}
              </span>
            ) : null}
          </span>
        }
        onConfirm={() => pendingTag && void run(() => removeTag(pendingTag))}
        onCancel={() => setPendingTag(null)}
      />

      <ConfirmDialog
        open={pendingMerge}
        busy={busy}
        title={copy.confirm.mergeTitle}
        confirmLabel={copy.confirm.mergeConfirm}
        cancelLabel={copy.confirm.cancel}
        message={
          <span className="flex flex-col gap-[10px]">
            <span>{copy.confirm.mergeMessage}</span>
            <MergePlan groups={mergeGroups} />
          </span>
        }
        onConfirm={() => void mergeTags()}
        onCancel={() => setPendingMerge(false)}
      />

      <ConfirmDialog
        open={pendingPrune}
        tone="danger"
        busy={busy}
        title={copy.confirm.pruneTitle}
        confirmLabel={copy.confirm.pruneConfirm}
        cancelLabel={copy.confirm.cancel}
        message={
          <span className="flex flex-col gap-[10px]">
            <span>{copy.confirm.pruneMessage}</span>
            <span className="flex flex-col gap-[6px] rounded-[10px] bg-[var(--admin-soft)] px-[12px] py-[10px]">
              {unusedTags.map((t) => (
                <span key={t.id} className="font-cn text-[12px] text-[var(--color-ink-2)]">
                  · {t.name}
                </span>
              ))}
            </span>
          </span>
        }
        onConfirm={() => void pruneTags()}
        onCancel={() => setPendingPrune(false)}
      />
    </div>
  )
}

/* --------------------------------------------------------------------- 行 */

function CategoryRow({
  category,
  actions,
  orderIndex,
  total,
  dragging,
  onDragStart,
}: {
  category: CategoryItem
  actions: readonly RowAction[]
  orderIndex: number
  total: number
  dragging: boolean
  onDragStart: (e: React.PointerEvent) => void
}) {
  const empty = category.postCount === 0
  return (
    <div
      data-category-id={category.id}
      /* 整行就是拖拽区（画布上没有把手）。行本身不可点击 ——「重命名」在行菜单里，
         所以不会出现「想拖却把编辑器点开了」那种冲突。 */
      onPointerDown={total > 1 ? onDragStart : undefined}
      title={total > 1 ? copy.category.dragTitle : undefined}
      className={[
        'flex items-center gap-[12px] px-[18px] py-[12px] transition-colors',
        total > 1 ? 'cursor-grab active:cursor-grabbing' : '',
        dragging ? 'hover:bg-[var(--admin-soft)]' : 'hover:bg-[var(--admin-soft)]',
      ].join(' ')}
    >
      <span className="flex min-w-0 flex-1 items-center gap-[9px]">
        <span
          className="h-[8px] w-[8px] shrink-0 rounded-full"
          style={{ background: empty ? DOT_EMPTY : dotColor(category.name) }}
          aria-hidden="true"
        />
        {/* 分类名中英混排很常见（「Android 工具链」），所以用 font-primary 而不是 font-latin：
            后者没有中文字面，汉字会掉到 system-ui 上，同一个名字里两种字形 */}
        <span className="truncate font-primary text-[12.5px] font-medium leading-none text-[var(--color-ink)]">
          {category.name}
        </span>
      </span>
      <span
        className={[
          'w-[70px] shrink-0 font-cn text-[11.5px] leading-none',
          empty ? 'text-[var(--admin-placeholder)]' : 'text-[var(--color-ink-3)]',
        ].join(' ')}
        /* 「0 篇」是「还没用上」，与「用过几次」不是一件事，所以整行弱化一档 */
        title={empty ? copy.category.emptyHint : undefined}
      >
        {copy.category.posts.replace('{n}', String(category.postCount))}
      </span>
      {/* 菜单要拦掉 pointerdown，否则点菜单会顺带开始拖动这一行 */}
      <span className="shrink-0" onPointerDown={(e) => e.stopPropagation()}>
        <RowMenu actions={actions} label={`${category.name} ${copy.category.more}`} />
      </span>
      <span className="sr-only">{`${orderIndex + 1} / ${total}`}</span>
    </div>
  )
}

/* ------------------------------------------------------------------- 标签 */

function TagChip({
  tag,
  top,
  active,
  onClick,
}: {
  tag: TagItem
  top: boolean
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      data-tag-id={tag.id}
      className={[
        'inline-flex h-[29px] items-center rounded-full px-[11px] font-primary text-[11.5px] leading-none transition-colors',
        top
          ? 'bg-[var(--color-primary-soft)] font-medium text-[var(--color-primary)]'
          : 'bg-[var(--admin-soft)] text-[var(--color-ink-2)]',
        active ? 'ring-[1.5px] ring-[var(--color-primary)]' : '',
        active ? '' : 'hover:bg-[var(--color-primary-soft)]',
      ].join(' ')}
    >
      {tag.name}
      <span className="font-latin opacity-60">{` ${tag.postCount}`}</span>
    </button>
  )
}

/** 合并计划。列的就是服务端算出来的那几组，与将要写进操作日志的句子同源。 */
function MergePlan({ groups }: { groups: MergeGroup[] }) {
  if (!groups.length) return null
  return (
    <span className="flex flex-col gap-[6px] rounded-[10px] bg-[var(--admin-soft)] px-[12px] py-[10px]">
      {groups.map((g) => (
        <span key={g.key} className="font-cn text-[12px] leading-[1.7] text-[var(--color-ink-2)]">
          · {g.text}
        </span>
      ))}
    </span>
  )
}

/* ------------------------------------------------------------------- 弹层 */

/** 新建分类 / 重命名分类 / 重命名标签，三处都是「一个名字」，所以只有一个弹层。 */
function NameDialog({
  title,
  subtitle,
  label,
  initial,
  max,
  onSubmit,
  onClose,
}: {
  title: string
  subtitle: string
  label: string
  initial: string
  max: number
  /** 失败就把消息抛回来 —— 由弹层自己显示在输入框旁边，而不是丢到页面顶部的提示条 */
  onSubmit: (name: string) => Promise<void>
  onClose: () => void
}) {
  const [value, setValue] = useState(initial)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const submit = async () => {
    const name = value.trim()
    if (!name) return
    setSaving(true)
    setError('')
    try {
      await onSubmit(name)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : copy.error)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open
      onClose={saving ? () => undefined : onClose}
      title={title}
      subtitle={subtitle}
      width={420}
      footer={
        <>
          <span />
          <div className="flex items-center gap-[10px]">
            <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>
              {copy.dialog.cancel}
            </Button>
            <Button size="sm" loading={saving} onClick={() => void submit()}>
              {saving ? copy.dialog.saving : copy.dialog.save}
            </Button>
          </div>
        </>
      }
    >
      <div className="flex flex-col gap-[14px]">
        {error ? <Notice tone="error">{error}</Notice> : null}
        <Field
          label={label}
          htmlFor="taxonomy-name"
          right={
            <span className="font-latin text-[10.5px] text-[var(--color-ink-3)]">
              {copy.dialog.count.replace('{n}', String(value.trim().length)).replace('{max}', String(max))}
            </span>
          }
        >
          <TextInput
            id="taxonomy-name"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                void submit()
              }
            }}
            maxLength={max || undefined}
            autoFocus
          />
        </Field>
      </div>
    </Modal>
  )
}
