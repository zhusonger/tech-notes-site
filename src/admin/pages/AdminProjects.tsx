/**
 * 项目卡片墙（画布 13:622）。
 *
 * 画布给了列表态，没给编辑态 —— 这不是漏画，是因为项目只有七个小字段，
 * 单独开一屏反而比就地改更绕。所以编辑走弹层（用的是后台既有的 `Modal`，
 * 不是新造一套），新建与编辑是同一个弹层。
 *
 * 三处刻意的取舍：
 *
 * 1. **拖拽只在「未筛选 + 按排序权重」时可用。** 筛选状态下前端只看得到一部分项目，
 *    它无从知道那些没显示的项目该落在哪里；按 Stars 排序时拖拽更是无意义 ——
 *    顺序由数值决定，拖了也会被重排回去。与其拖完发现顺序没变，不如事先把把手关掉，
 *    并且**说明为什么关掉**（悬停提示）。
 *
 * 2. **排序提交的是整份 id 列表，不是「把 A 移到 B 前面」。** 后者要求服务端复现
 *    前端这套移动算法，两边算错一次顺序就静默错位。下标即顺序，没有解释空间。
 *
 * 3. **拖拽用 pointer 事件手写，不用 HTML5 DnD。** DnD 的 `draggable` 是元素级属性，
 *    要让它「只能从把手拖」，得在 dragstart 里判断来源并 preventDefault —— 而卡片本身
 *    是可点击的（点击进编辑），两者在同一次交互里打架。pointer 事件从把手起手，
 *    点击与拖拽天然分开。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { adminProjectsCopy as copy } from '../../data/admin'
import {
  ApiError,
  adminApi,
  type ProjectItem,
  type ProjectListResponse,
  type ProjectSortKey,
  type ProjectStatus,
} from '../adminApi'
import {
  ArrowDownIcon,
  ArrowUpIcon,
  BoxIcon,
  DragHandleIcon,
  ExternalIcon,
  PencilIcon,
  StarIcon,
  TrashIcon,
  UndoIcon,
} from '../AdminIcons'
import {
  Badge,
  Button,
  Chip,
  ChipCount,
  ConfirmDialog,
  ControlSelect,
  EmptyState,
  Field,
  Modal,
  Notice,
  PageHeader,
  RowMenu,
  SelectInput,
  SkeletonRows,
  Switch,
  TextArea,
  TextInput,
  Toolbar,
  type RowAction,
} from '../ui'

/** 语言下拉里的「其他」哨兵值。用不可能成为语言名的串，而不是空串（空串另有含义：未指定）。 */
const LANGUAGE_OTHER = '__other__'

/** 画布上语言圆点是不区分语言的同一个灰，这里沿用：区分颜色需要一套图例，而画布没给。 */
const LANGUAGE_DOT = '#c4bdb4'

/** 服务端返回的排序口径是闭集，这里再收一次，防止 URL 上被塞进别的值。 */
const SORT_KEYS: ProjectSortKey[] = ['order', 'stars', 'updated']

interface ProjectForm {
  title: string
  slug: string
  description: string
  tags: string
  /** 现有语言之一，或 `LANGUAGE_OTHER`（此时用 `languageNew`），或空串（未指定） */
  languageChoice: string
  languageNew: string
  stars: string
  forks: string
  repoUrl: string
  featured: boolean
  status: ProjectStatus
}

const emptyForm = (): ProjectForm => ({
  title: '',
  slug: '',
  description: '',
  tags: '',
  languageChoice: '',
  languageNew: '',
  stars: '0',
  forks: '0',
  repoUrl: '',
  featured: false,
  status: 'published',
})

const formFrom = (p: ProjectItem): ProjectForm => ({
  title: p.title,
  slug: p.slug,
  description: p.description,
  tags: p.tags,
  languageChoice: p.language,
  languageNew: '',
  stars: String(p.stars),
  forks: String(p.forks),
  repoUrl: p.repoUrl,
  featured: p.featured,
  status: p.status,
})

/** 只用于展示的 stars 计数，与前台同一口径（`1.8k` 那种）。 */
function starsLabel(n: number): string {
  if (n < 1000) return String(n)
  const k = n / 1000
  return `${k >= 10 ? Math.round(k) : Math.round(k * 10) / 10}k`
}

export default function AdminProjects() {
  const [search, setSearch] = useSearchParams()
  const [language, setLanguage] = useState('all')
  const [sort, setSort] = useState<ProjectSortKey>('order')

  const [data, setData] = useState<ProjectListResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)
  const [busyId, setBusyId] = useState<number | null>(null)

  /** 弹层：`'new'` 是新建，`ProjectItem` 是编辑，`null` 是关闭 */
  const [editing, setEditing] = useState<ProjectItem | 'new' | null>(null)
  const [pendingRemove, setPendingRemove] = useState<ProjectItem | null>(null)

  /** 拖拽中的本地顺序。非空即表示「正在拖」——渲染与提交都以它为准。 */
  const [orderOverride, setOrderOverride] = useState<number[] | null>(null)
  const dragMovedRef = useRef(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await adminApi.projects({ language, sort })
      setData(res)
      setLoadError('')
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : copy.error)
    } finally {
      setLoading(false)
    }
  }, [language, sort])

  useEffect(() => {
    void load()
  }, [load])

  /* 顶栏那颗「新建项目」把 `?new=1` 带过来。放在地址里而不是状态里，
     是为了刷新之后那一屏还在 —— 「点了新建、按了刷新、空手回来」最难解释。 */
  useEffect(() => {
    if (search.get('new') === '1') setEditing('new')
  }, [search])

  const closeDialog = () => {
    setEditing(null)
    if (search.get('new') === '1') {
      const next = new URLSearchParams(search)
      next.delete('new')
      setSearch(next, { replace: true })
    }
  }

  const items = useMemo(() => data?.items ?? [], [data])

  /** 拖拽期间与提交后到服务端回执之间，列表都按本地顺序渲染，避免「松手弹回去」的跳变。 */
  const shown = useMemo(() => {
    if (!orderOverride) return items
    const byId = new Map(items.map((p) => [p.id, p]))
    return orderOverride.map((id) => byId.get(id)).filter((p): p is ProjectItem => Boolean(p))
  }, [items, orderOverride])

  const canReorder = language === 'all' && sort === 'order'

  /* -------------------------------------------------------------- 拖拽排序 */
  const beginDrag = (e: React.PointerEvent, id: number) => {
    if (!canReorder || items.length < 2) return
    e.preventDefault()

    const initial = items.map((p) => p.id)
    if (!initial.includes(id)) return

    let working = initial
    dragMovedRef.current = false
    setOrderOverride(initial)

    const idAt = (x: number, y: number): number | null => {
      const host = (document.elementFromPoint(x, y) as HTMLElement | null)?.closest('[data-project-id]')
      const n = Number(host?.getAttribute('data-project-id') ?? NaN)
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

    /* 拖拽中禁掉文本选中：否则掠过卡片文字会留下一片蓝色选区，
       看起来像「选中了这些项目」，而实际发生的是一次排序。 */
    document.body.style.userSelect = 'none'
    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
    document.addEventListener('pointercancel', onUp)
  }

  /**
   * 提交新顺序。
   *
   * 失败时不去本地「反向算回去」，而是重取一次列表：本地回滚要自己维护一份
   * 改动前的快照，而快照一旦与库不一致，回滚出来的顺序就是第三种顺序 ——
   * 谁也不认它。重取虽然多一次往返，但结果一定与库一致。
   */
  const commitOrder = async (next: number[]) => {
    try {
      const res = await adminApi.reorderProjects(next)
      // 以服务端回来的顺序为准，然后清掉本地覆盖
      setData((d) => (d ? { ...d, items: res.items } : d))
      setOrderOverride(null)
      setNotice({ tone: 'success', text: copy.orderSaved.replace('{n}', String(next.length)) })
    } catch (err) {
      setOrderOverride(null)
      await load()
      setNotice({
        tone: 'error',
        text: `${copy.orderError}（${err instanceof ApiError ? err.message : copy.error}）`,
      })
    }
  }

  /** 键盘可达的排序替代路径：行菜单里的上移 / 下移。拖拽不是唯一入口。 */
  const moveBy = async (id: number, delta: number) => {
    const ids = items.map((p) => p.id)
    const from = ids.indexOf(id)
    const to = from + delta
    if (from === -1 || to < 0 || to >= ids.length) return
    const next = ids.slice()
    next.splice(from, 1)
    next.splice(to, 0, id)
    setOrderOverride(next)
    await commitOrder(next)
  }

  /* ----------------------------------------------------------------- 增删改 */
  const patch = async (id: number, payload: Parameters<typeof adminApi.saveProject>[1], okText: string) => {
    setBusyId(id)
    try {
      const res = await adminApi.saveProject(id, payload)
      setData((d) =>
        d ? { ...d, items: d.items.map((p) => (p.id === id ? res.project : p)), counts: res.counts, languages: res.languages } : d
      )
      setNotice({ tone: 'success', text: okText })
    } catch (err) {
      setNotice({ tone: 'error', text: err instanceof ApiError ? err.message : copy.error })
    } finally {
      setBusyId(null)
    }
  }

  const remove = async (p: ProjectItem) => {
    setBusyId(p.id)
    try {
      const res = await adminApi.deleteProject(p.id)
      setData((d) => (d ? { ...d, items: d.items.filter((x) => x.id !== p.id), counts: res.counts, languages: res.languages } : d))
      setNotice({ tone: 'success', text: copy.deleted.replace('{title}', p.title) })
      setPendingRemove(null)
    } catch (err) {
      setNotice({ tone: 'error', text: err instanceof ApiError ? err.message : copy.error })
    } finally {
      setBusyId(null)
    }
  }

  const rowActions = (p: ProjectItem): RowAction[] => {
    const actions: RowAction[] = [
      { key: 'edit', label: copy.rowMenu.edit, icon: <PencilIcon className="h-[14px] w-[14px]" />, onSelect: () => setEditing(p) },
      {
        key: 'feature',
        label: p.featured ? copy.rowMenu.unfeature : copy.rowMenu.feature,
        icon: <StarIcon className="h-[14px] w-[14px]" />,
        onSelect: () => void patch(p.id, { featured: !p.featured }, p.featured ? copy.unfeatured.replace('{title}', p.title) : copy.featured.replace('{title}', p.title)),
      },
      {
        key: 'status',
        label: p.status === 'published' ? copy.rowMenu.unpublish : copy.rowMenu.publish,
        icon: p.status === 'published' ? <UndoIcon className="h-[14px] w-[14px]" /> : <ArrowUpIcon className="h-[14px] w-[14px]" />,
        onSelect: () =>
          void patch(
            p.id,
            { status: p.status === 'published' ? 'draft' : 'published' },
            p.status === 'published' ? copy.unpublished.replace('{title}', p.title) : copy.published.replace('{title}', p.title)
          ),
      },
    ]

    if (p.repoUrl) {
      actions.push({
        key: 'repo',
        label: copy.rowMenu.openRepo,
        icon: <ExternalIcon className="h-[14px] w-[14px]" />,
        onSelect: () => window.open(p.repoUrl, '_blank', 'noopener'),
      })
    }

    /* 排序项只在真能排序时出现，并且标出「移到顶 / 移到底」的边界不可用 ——
       一个点了没反应的菜单项比一个灰着的更让人困惑。 */
    if (canReorder) {
      const index = items.findIndex((x) => x.id === p.id)
      actions.push(
        { key: 'up', label: copy.rowMenu.moveUp, icon: <ArrowUpIcon className="h-[14px] w-[14px]" />, disabled: index <= 0, onSelect: () => void moveBy(p.id, -1) },
        { key: 'down', label: copy.rowMenu.moveDown, icon: <ArrowDownIcon className="h-[14px] w-[14px]" />, disabled: index >= items.length - 1, onSelect: () => void moveBy(p.id, 1) }
      )
    }

    actions.push({ key: 'remove', label: copy.rowMenu.remove, icon: <TrashIcon className="h-[14px] w-[14px]" />, danger: true, onSelect: () => setPendingRemove(p) })
    return actions
  }

  const subtitle = copy.subtitle
    .replace('{all}', String(data?.counts.all ?? 0))
    .replace('{featured}', String(data?.counts.featured ?? 0))
    .replace('{stars}', data?.counts.starsLabel ?? '0')
    .replace('{reorder}', canReorder ? copy.reorderOn : copy.reorderOff)

  return (
    <div className="flex flex-col gap-[18px]">
      <PageHeader title={copy.title} subtitle={subtitle} />

      <Toolbar
        left={
          <>
            <Chip active={language === 'all'} onClick={() => setLanguage('all')}>
              {copy.filter.all}
              <ChipCount>{data?.counts.all ?? 0}</ChipCount>
            </Chip>
            {(data?.languages ?? []).map((l) => (
              <Chip key={l.name} active={language === l.name} onClick={() => setLanguage(l.name)}>
                {l.name}
                <ChipCount>{l.count}</ChipCount>
              </Chip>
            ))}
          </>
        }
        right={
          <ControlSelect
            value={sort}
            onChange={(v) => setSort((SORT_KEYS as string[]).includes(v) ? (v as ProjectSortKey) : 'order')}
            options={[
              { value: 'order', label: copy.sortOptions.order },
              { value: 'stars', label: copy.sortOptions.stars },
              { value: 'updated', label: copy.sortOptions.updated },
            ]}
            ariaLabel={copy.filter.sort}
          />
        }
      />

      {notice ? (
        <Notice tone={notice.tone} onClose={() => setNotice(null)}>
          {notice.text}
        </Notice>
      ) : null}

      {loadError && !data ? (
        <div className="flex flex-col items-start gap-[12px]">
          <Notice tone="error">{loadError}</Notice>
          <Button variant="outline" size="sm" onClick={() => void load()}>
            {copy.retry}
          </Button>
        </div>
      ) : loading && !data ? (
        <div className="rounded-[14px] border border-[var(--color-line)] bg-[var(--admin-surface)] py-[10px]">
          <SkeletonRows rows={4} height={96} />
        </div>
      ) : shown.length === 0 ? (
        <div className="rounded-[14px] border border-[var(--color-line)] bg-[var(--admin-surface)]">
          <EmptyState title={language === 'all' ? copy.empty.all : copy.empty.filtered} hint={copy.empty.hint} />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-[18px]">
          {shown.map((p) => (
            <ProjectCard
              key={p.id}
              project={p}
              busy={busyId === p.id}
              dragging={Boolean(orderOverride) && dragMovedRef.current}
              canReorder={canReorder}
              actions={rowActions(p)}
              onEdit={() => setEditing(p)}
              onToggleFeatured={() =>
                void patch(
                  p.id,
                  { featured: !p.featured },
                  p.featured ? copy.unfeatured.replace('{title}', p.title) : copy.featured.replace('{title}', p.title)
                )
              }
              onDragStart={(e) => beginDrag(e, p.id)}
            />
          ))}
        </div>
      )}

      {editing ? (
        <ProjectDialog
          project={editing === 'new' ? null : editing}
          languages={(data?.languages ?? []).map((l) => l.name)}
          onClose={closeDialog}
          onSaved={(project, created) => {
            setData((d) => {
              if (!d) return d
              const exists = d.items.some((p) => p.id === project.id)
              return exists
                ? { ...d, items: d.items.map((p) => (p.id === project.id ? project : p)) }
                : { ...d, items: [...d.items, project] }
            })
            setNotice({
              tone: 'success',
              text: (created ? copy.dialog.created : copy.dialog.saved).replace('{title}', project.title),
            })
            closeDialog()
            /* 改了字段就重取一次：计数（个 / 精选 / stars）与语言筛选条都受影响，
               本地拼不如让服务端算 —— 那也是前台将来会看到的数。 */
            void load()
          }}
        />
      ) : null}

      <ConfirmDialog
        open={Boolean(pendingRemove)}
        title={copy.confirmRemoveTitle}
        message={copy.confirmDelete.replace('{title}', pendingRemove?.title ?? '')}
        confirmLabel={copy.rowMenu.remove}
        cancelLabel={copy.dialog.cancel}
        tone="danger"
        busy={busyId === pendingRemove?.id}
        onConfirm={() => pendingRemove && void remove(pendingRemove)}
        onCancel={() => setPendingRemove(null)}
      />
    </div>
  )
}

/* --------------------------------------------------------------------- 卡片 */
function ProjectCard({
  project,
  busy,
  dragging,
  canReorder,
  actions,
  onEdit,
  onToggleFeatured,
  onDragStart,
}: {
  project: ProjectItem
  busy: boolean
  dragging: boolean
  canReorder: boolean
  actions: readonly RowAction[]
  onEdit: () => void
  onToggleFeatured: () => void
  onDragStart: (e: React.PointerEvent) => void
}) {
  const draft = project.status !== 'published'

  return (
    <article
      data-project-id={project.id}
      /* 整卡可点进编辑是一次顺手的便利，**不是**唯一的入口：
         键盘与读屏走标题那个真按钮，或行菜单里的「编辑」。
         所以这里不给 article 加 role="button" —— 它的内部还有别的按钮，
         button 里嵌 button 既不合规，浏览器解析 HTML 时也会把外层按钮提前闭合。 */
      onClick={onEdit}
      className={[
        'flex min-h-[240px] cursor-pointer flex-col gap-[14px] rounded-[14px] border bg-[var(--admin-surface)] p-[22px] transition-colors',
        busy ? 'opacity-60' : '',
        dragging ? 'border-[var(--color-primary)]' : 'border-[var(--color-line)] hover:border-[var(--color-primary)]',
      ].join(' ')}
    >
      {/* 头部：图标 + 更多 + 拖拽把手。两个控件都要拦掉冒泡，否则点菜单会顺带打开编辑器。 */}
      <div className="flex items-center gap-[8px]">
        <span className="flex h-[40px] w-[40px] shrink-0 items-center justify-center rounded-[11px] bg-[var(--admin-soft-strong)] text-[var(--color-primary)]">
          <BoxIcon className="h-[20px] w-[20px]" />
        </span>
        <span className="flex-1" />

        <span onClick={(e) => e.stopPropagation()}>
          <RowMenu actions={actions} label={copy.moreActions} />
        </span>

        <button
          type="button"
          onPointerDown={canReorder ? onDragStart : undefined}
          disabled={!canReorder}
          aria-label={copy.dragHandle}
          title={canReorder ? copy.reorderOn : copy.reorderOff}
          className={[
            'inline-flex h-[24px] w-[24px] shrink-0 items-center justify-center rounded-[7px] text-[#c4bdb4] transition-colors',
            canReorder
              ? 'cursor-grab hover:bg-[var(--admin-soft)] hover:text-[var(--color-ink-3)] active:cursor-grabbing'
              : 'cursor-not-allowed opacity-45',
          ].join(' ')}
        >
          <DragHandleIcon className="h-[16px] w-[16px]" />
        </button>
      </div>

      <div className="flex flex-1 flex-col gap-[14px]">
        {/* 用 font-primary（Inter → Noto Sans SC）而不是 font-latin：项目名常常是
            「Android 长列表 A4 打印工具链」这种中英混排，font-latin 里没有中文字面，
            汉字会掉到 system-ui 上 —— 同一个标题里两种字形，一眼就能看出是拼的。 */}
        <h3 className="font-primary text-[14.5px] font-semibold leading-[1.4] text-[var(--color-ink)]">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onEdit()
            }}
            className="rounded-[6px] text-left transition-colors hover:text-[var(--color-primary)]"
          >
            {project.title}
          </button>
        </h3>

        <p className="font-cn text-[12px] leading-[1.75] text-[var(--color-ink-3)]">
          {project.description || copy.noDescription}
        </p>

        <div className="mt-auto flex w-full items-center gap-[8px]">
          {project.language ? (
            <>
              <span
                className="h-[8px] w-[8px] shrink-0 rounded-full"
                style={{ background: LANGUAGE_DOT }}
                aria-hidden="true"
              />
              <span className="font-latin text-[11.5px] leading-none text-[var(--color-ink-3)]">
                {project.language}
              </span>
            </>
          ) : null}

          <span className="flex-1" />

          {draft ? <Badge tone="muted">{copy.card.draftBadge}</Badge> : null}

          <span className="font-latin text-[11.5px] font-medium leading-none text-[var(--color-ink-2)]">
            {copy.card.stars.replace('{n}', starsLabel(project.stars))}
          </span>

          {/* 精选徽标只在精选时出现（与画布一致）。
              它同时是个开关，但**只用于取消**：「想上精选」走行菜单，多一步的摩擦是有意的 ——
              首页只有 3 个位置，进精选该是一次明确的选择；而取消精选是撤销，随手一点即可。 */}
          {project.featured ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onToggleFeatured()
              }}
              title={copy.rowMenu.unfeature}
              className="inline-flex h-[20px] shrink-0 items-center rounded-[6px] bg-[var(--color-primary-soft)] px-[8px] font-cn text-[10.5px] font-medium leading-none text-[var(--color-primary)] transition-colors hover:bg-[#fbe3d2]"
            >
              {copy.card.featuredBadge}
            </button>
          ) : null}
        </div>
      </div>
    </article>
  )
}

/* --------------------------------------------------------------------- 弹层 */
/**
 * 新建 / 编辑项目。
 *
 * 「主要语言」给的是**下拉**而不是输入框：语言名在前台会变成筛选条上的一项，
 * 手打一个错别字就会多出一个只出现一次的分类。下拉覆盖库中已有的语言，
 * 确实要新语言时走「其他语言…」。这是既有偏好（能用选项就不让人填）在这屏的落法。
 */
function ProjectDialog({
  project,
  languages,
  onClose,
  onSaved,
}: {
  project: ProjectItem | null
  languages: string[]
  onClose: () => void
  onSaved: (project: ProjectItem, created: boolean) => void
}) {
  const [form, setForm] = useState<ProjectForm>(() => (project ? formFrom(project) : emptyForm()))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  /** 「其他语言」被选中但没填名字 —— 单独标在那一格上，比丢一句笼统的错误更好定位 */
  const [fieldError, setFieldError] = useState('')

  const set = <K extends keyof ProjectForm>(key: K, value: ProjectForm[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  const submit = async () => {
    const language = form.languageChoice === LANGUAGE_OTHER ? form.languageNew.trim() : form.languageChoice
    if (form.languageChoice === LANGUAGE_OTHER && !language) {
      setFieldError(copy.dialog.languageNewEmpty)
      return
    }

    const payload = {
      title: form.title.trim(),
      description: form.description.trim(),
      tags: form.tags.trim(),
      language,
      stars: Number.parseInt(form.stars, 10),
      forks: Number.parseInt(form.forks, 10),
      repoUrl: form.repoUrl.trim(),
      featured: form.featured,
      status: form.status,
    } as Parameters<typeof adminApi.saveProject>[1]

    /* 永久链接留空 = 不改。新建时由服务端按名称生成，编辑时保持原值 ——
       两种情况下「留空」的语义一致，都是「这块不归我管」。 */
    const slug = form.slug.trim()
    if (slug) payload.slug = slug

    setSaving(true)
    setError('')
    try {
      const res = project ? await adminApi.saveProject(project.id, payload) : await adminApi.createProject(payload)
      onSaved(res.project, !project)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : copy.dialog.saveError)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open
      onClose={saving ? () => undefined : onClose}
      title={project ? copy.dialog.editTitle : copy.dialog.createTitle}
      subtitle={copy.dialog.subtitle}
      width={560}
      footer={
        <>
          <span className="font-cn text-[11px] text-[var(--color-ink-3)]">
            {project ? copy.dialog.slugHint : ''}
          </span>
          <div className="flex items-center gap-[10px]">
            <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>
              {copy.dialog.cancel}
            </Button>
            <Button size="sm" loading={saving} onClick={() => void submit()}>
              {saving ? (project ? copy.dialog.saving : copy.dialog.creating) : copy.dialog.save}
            </Button>
          </div>
        </>
      }
    >
      <div className="flex flex-col gap-[16px]">
        {error ? <Notice tone="error">{error}</Notice> : null}

        <Field label={copy.dialog.name} htmlFor="proj-title">
          <TextInput
            id="proj-title"
            value={form.title}
            onChange={(e) => set('title', e.target.value)}
            placeholder={copy.dialog.namePlaceholder}
            autoFocus
          />
        </Field>

        <div className="grid grid-cols-2 gap-[14px]">
          <Field label={copy.dialog.slug} htmlFor="proj-slug" hint={copy.dialog.slugHint}>
            <TextInput
              id="proj-slug"
              value={form.slug}
              onChange={(e) => set('slug', e.target.value)}
              placeholder={project ? project.slug : copy.dialog.slugPlaceholder}
              className="font-primary"
            />
          </Field>

          <Field label={copy.dialog.language} htmlFor="proj-language">
            <SelectInput
              id="proj-language"
              value={form.languageChoice}
              onChange={(e) => {
                set('languageChoice', e.target.value)
                setFieldError('')
              }}
            >
              <option value="">{copy.dialog.languageNone}</option>
              {languages.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
              <option value={LANGUAGE_OTHER}>{copy.dialog.languageOther}</option>
            </SelectInput>
          </Field>
        </div>

        {form.languageChoice === LANGUAGE_OTHER ? (
          <Field label={copy.dialog.languageNew} hint={fieldError || undefined}>
            <TextInput
              value={form.languageNew}
              onChange={(e) => set('languageNew', e.target.value)}
              placeholder={copy.dialog.languageNewPlaceholder}
              className="font-primary"
              invalid={Boolean(fieldError)}
            />
          </Field>
        ) : null}

        <Field label={copy.dialog.description}>
          <TextArea
            rows={3}
            value={form.description}
            onChange={(e) => set('description', e.target.value)}
            placeholder={copy.dialog.descriptionPlaceholder}
          />
        </Field>

        <Field label={copy.dialog.tags} hint={copy.dialog.tagsHint}>
          <TextInput value={form.tags} onChange={(e) => set('tags', e.target.value)} placeholder="TypeScript · adb · Pillow" />
        </Field>

        <div className="grid grid-cols-2 gap-[14px]">
          <Field label={copy.dialog.stars}>
            <TextInput
              type="number"
              min={0}
              value={form.stars}
              onChange={(e) => set('stars', e.target.value)}
              className="font-primary"
            />
          </Field>
          <Field label={copy.dialog.forks}>
            <TextInput
              type="number"
              min={0}
              value={form.forks}
              onChange={(e) => set('forks', e.target.value)}
              className="font-primary"
            />
          </Field>
        </div>

        <Field label={copy.dialog.repoUrl} hint={copy.dialog.repoUrlHint}>
          <TextInput
            value={form.repoUrl}
            onChange={(e) => set('repoUrl', e.target.value)}
            placeholder="https://github.com/…"
            className="font-primary"
          />
        </Field>

        <div className="flex flex-col gap-[12px] rounded-[12px] bg-[var(--admin-soft-strong)] px-[14px] py-[12px]">
          <div className="flex items-center justify-between gap-[12px]">
            <span className="font-cn text-[12.5px] text-[var(--color-ink-2)]">{copy.dialog.status}</span>
            <SelectInput
              value={form.status}
              onChange={(e) => set('status', e.target.value === 'draft' ? 'draft' : 'published')}
              className="w-[190px]"
            >
              <option value="published">{copy.dialog.statusPublished}</option>
              <option value="draft">{copy.dialog.statusDraft}</option>
            </SelectInput>
          </div>
          <div className="flex items-center justify-between gap-[12px]">
            <span className="font-cn text-[12.5px] text-[var(--color-ink-2)]">{copy.dialog.featured}</span>
            <Switch checked={form.featured} onChange={(v) => set('featured', v)} label={copy.dialog.featured} />
          </div>
        </div>
      </div>
    </Modal>
  )
}
