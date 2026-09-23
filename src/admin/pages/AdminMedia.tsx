/**
 * 媒体库（设计稿 14 屏里的第 5 屏，画布 `13:1093`）。
 *
 * 这一屏的骨架与「简历编辑」同构：左边主区 + 右边固定宽度的详情面板。
 * 区别在于主区是**文件网格**而不是表单，因此多出三件只在文件库上才成立的事：
 *
 * 1. **上传要能拖。** 拖动进来的是文件本体，不是文件名 —— 拖放区拿到的 `File`
 *    直接当请求体发走。体积与类型在前端先拦一道，只为省一次必然失败的往返；
 *    真正的判定仍在服务端（白名单从那边下发）。
 * 2. **删除要看引用。** 一张图被哪些地方引用，没有任何字段记得住，是服务端现扫出来的。
 *    所以删除分两步：被引用时先摆出清单，看清代价再传 `force` 删。
 * 3. **文件名是只读的。** 它是磁盘路径与所有引用的锚点，改名要同时动文件、库、
 *    以及四处引用 —— 做一个只改一半的「重命名」比不做更糟，所以界面上只读、
 *    接口也拒收（见 `server/media.mjs` 的 `validateMediaPayload`）。
 *
 * 画布上有、这里刻意没做的两件：
 *   - **「新建文件夹」**：库里没有文件夹这一维（上传落盘是扁平的），
 *     做出来只会是个假按钮。
 *   - **「存储用量 24%」那根进度条**：没有配额这一说，百分比只能编。
 *     这里换成真实占用（文件数 + 字节数），数字全部来自磁盘。
 *
 * 画布之外补上的两件（都是「文件库 vs 文档列表」的差别逼出来的）：
 *
 *   - **能不能删文件，取决于它从哪来。** 后台上传的落在持久卷上，删了就是真没了；
 *     随构建产物发布的素材（Hero、头像这类）本体在版本库里，运行期删掉会在下次
 *     构建时被原样拷回来。所以后者的删除入口直接关掉并写明理由 —— 与其让人点完
 *     发现文件回来了，不如一开始就说清楚（`policy.origins` 由服务端下发，
 *     界面上的禁用与接口的拒收读的是同一份）。
 *   - **多选批量删除。** 勾选（批量）与「点击进详情面板查看」是**两件事**，所以
 *     它们是两个独立的信号：勾选看左上角那个复选框与橙色底，详情看右侧面板里
 *     正在展示哪个文件。勾选范围限于当前页（见 `ui.tsx` 的 `usePageSelection`）——
 *     被引用的文件与随构建发布的素材由服务端跳过，理由在操作后的清单里逐条给出。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertIcon, CopyIcon, ExternalIcon, TrashIcon } from '../AdminIcons'
import {
  adminApi,
  ApiError,
  type BulkSkipped,
  type MediaFacets,
  type MediaItem,
  type MediaKind,
  type MediaListResponse,
  type MediaOrigin,
  type MediaOriginRule,
  type MediaSortKey,
} from '../adminApi'
import { adminMediaCopy as copy } from '../../data/admin'
import {
  AdminCard,
  Button,
  CardFoot,
  CardHead,
  Checkbox,
  Chip,
  ChipCount,
  ConfirmDialog,
  ControlSelect,
  Divider,
  EmptyState,
  Field,
  HeaderButton,
  Notice,
  PageHeader,
  Pager,
  ReadonlyValue,
  SelectionBar,
  SkeletonRows,
  TextInput,
  Toolbar,
  useSelection,
} from '../ui'

/** 网格与列表每页条数不同：网格一行 3–4 个，列表一行 1 个。 */
const PAGE_SIZE = { grid: 12, list: 24 } as const
type ViewMode = keyof typeof PAGE_SIZE

/* --------------------------------------------------------------------- 图形 */
/* 三个图标只在这一屏用得到（上传 / 网格 / 列表），就近声明，不进公共图标库。 */

const stroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round' as const }

const UploadGlyph = ({ className = '' }: { className?: string }) => (
  <svg viewBox="0 0 16 16" className={className} aria-hidden="true">
    <path d="M8 11V3.6" {...stroke} />
    <path d="M5 6.4 8 3.4l3 3" {...stroke} />
    <path d="M3 10.5v1.3c0 .9.7 1.6 1.6 1.6h6.8c.9 0 1.6-.7 1.6-1.6v-1.3" {...stroke} />
  </svg>
)

const GridGlyph = ({ className = '' }: { className?: string }) => (
  <svg viewBox="0 0 14 14" className={className} aria-hidden="true">
    <rect x="1.2" y="1.2" width="4.8" height="4.8" rx="1.2" {...stroke} />
    <rect x="8" y="1.2" width="4.8" height="4.8" rx="1.2" {...stroke} />
    <rect x="1.2" y="8" width="4.8" height="4.8" rx="1.2" {...stroke} />
    <rect x="8" y="8" width="4.8" height="4.8" rx="1.2" {...stroke} />
  </svg>
)

const ListGlyph = ({ className = '' }: { className?: string }) => (
  <svg viewBox="0 0 14 14" className={className} aria-hidden="true">
    <path d="M4.8 3.4h8" {...stroke} />
    <path d="M4.8 7h8" {...stroke} />
    <path d="M4.8 10.6h8" {...stroke} />
    <circle cx="1.9" cy="3.4" r="0.9" fill="currentColor" />
    <circle cx="1.9" cy="7" r="0.9" fill="currentColor" />
    <circle cx="1.9" cy="10.6" r="0.9" fill="currentColor" />
  </svg>
)

/* --------------------------------------------------------------------- 小件 */

/** `2026-09-22T04:08:56.207Z` → `2026-09-22 12:08`。列表里只到分钟，秒没有信息量。 */
function formatWhen(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return copy.detail.unknown
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

/** 顶栏那颗占用胶囊。数字来自服务端现场统计，不是配额百分比。 */
function UsagePill({ label, loading }: { label: string; loading: boolean }) {
  return (
    <span className="inline-flex h-[34px] items-center gap-[8px] rounded-full border border-[var(--color-line)] bg-[var(--color-primary-soft)] px-[14px]">
      <span className="font-cn text-[11.5px] text-[var(--color-ink-3)]">{copy.usage.label}</span>
      <span className="font-cn text-[11.5px] font-medium text-[var(--color-ink-2)]">
        {loading ? copy.usage.loading : label}
      </span>
    </span>
  )
}

function ViewToggle({ view, onChange }: { view: ViewMode; onChange: (next: ViewMode) => void }) {
  const seg = (active: boolean) =>
    [
      'inline-flex h-[24px] items-center gap-[6px] rounded-[6px] px-[8px] font-cn text-[12px] leading-none transition-colors',
      active
        ? 'bg-[var(--color-primary-soft)] font-semibold text-[var(--color-primary)]'
        : 'text-[var(--color-ink-2)] hover:text-[var(--color-primary)]',
    ].join(' ')
  return (
    <div
      role="group"
      aria-label="视图切换"
      className="inline-flex shrink-0 items-center gap-[2px] rounded-[9px] border border-[var(--color-line)] bg-[var(--admin-surface)] p-[3px]"
    >
      <button
        type="button"
        aria-pressed={view === 'grid'}
        onClick={() => onChange('grid')}
        className={seg(view === 'grid')}
      >
        <GridGlyph className="h-[12px] w-[12px]" />
        {copy.view.grid}
      </button>
      <button
        type="button"
        aria-pressed={view === 'list'}
        onClick={() => onChange('list')}
        className={seg(view === 'list')}
      >
        <ListGlyph className="h-[12px] w-[12px]" />
        {copy.view.list}
      </button>
    </div>
  )
}

/* --------------------------------------------------------------------- 页面 */

export default function AdminMedia() {
  const [data, setData] = useState<MediaListResponse | null>(null)
  const [facets, setFacets] = useState<MediaFacets | null>(null)
  const [kind, setKind] = useState<string>('all')
  const [sort, setSort] = useState<MediaSortKey>('recent')
  const [view, setView] = useState<ViewMode>('grid')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [warn, setWarn] = useState('')

  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [altDraft, setAltDraft] = useState('')
  const [saving, setSaving] = useState(false)

  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [removing, setRemoving] = useState<MediaItem | null>(null)
  const [removeBusy, setRemoveBusy] = useState(false)

  /** 批量删除：确认弹层开关、进行中标记、以及回执里那张「被跳过」清单 */
  const [bulkOpen, setBulkOpen] = useState(false)
  const [bulkBusy, setBulkBusy] = useState(false)
  const [bulkSkipped, setBulkSkipped] = useState<BulkSkipped[]>([])

  const [page, setPage] = useState(1)
  const fileRef = useRef<HTMLInputElement>(null)
  /** 拖拽进出会在子元素上反复触发 `dragleave`，用计数抵消，否则悬停态会闪。 */
  const dragDepth = useRef(0)

  const items = data?.items ?? []
  const counts = (facets ?? data)?.counts
  const totalLabel = (facets ?? data)?.totalLabel ?? copy.usage.empty
  const missingCount = (facets ?? data)?.missing ?? 0
  const kinds = data?.kinds ?? []
  const sorts = data?.sorts ?? []
  /** `origins` 在加载态是空表：那时列表里还没有任何文件，查不到也只影响不到谁。
      类型要显式标注 —— 直接写 `{}` 会被推成空对象类型，用 `item.origin` 索引就报错。 */
  const policy = data?.policy ?? {
    accept: '',
    hint: '',
    maxBytes: 0,
    maxAlt: 0,
    origins: {} as Record<MediaOrigin, MediaOriginRule>,
  }

  /**
   * 来源策略。界面需要它回答两件事：这条能不能删、删不掉时说什么。
   * 两件事都由服务端下发（`policy.origins`），前端不判断「哪种前缀算谁」——
   * 那正是 `server/media.mjs` 里 `originOf` 的职责，抄一份就多一处会说岔的地方。
   */
  const originRule = (item: MediaItem) => policy.origins[item.origin]
  const removable = (item: MediaItem) => Boolean(originRule(item)?.removable)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await adminApi.media({ kind, sort })
      setData(res)
      setFacets(res)
      /* 分组切换后原来选中的文件可能已经不在列表里 —— 与其让右侧面板停在一个
         看不见的文件上，不如退回列表首项。 */
      setSelectedId((prev) =>
        prev !== null && res.items.some((i) => i.id === prev) ? prev : (res.items[0]?.id ?? null)
      )
    } catch (err) {
      setError(err instanceof ApiError ? err.message : copy.loadError)
    } finally {
      setLoading(false)
    }
  }, [kind, sort])

  useEffect(() => {
    void load()
  }, [load])

  /* 分组或视图一变就回第一页：停在第 3 页却只剩 1 页，会看到一个空网格 */
  useEffect(() => {
    setPage(1)
  }, [kind, sort, view])

  const selected = useMemo(() => items.find((i) => i.id === selectedId) ?? null, [items, selectedId])

  /* 选中项变了就重置草稿。用 id 做依赖而不是用对象：列表刷新会换掉对象引用，
     用对象做依赖会把正在敲的替代文本一起冲掉。 */
  useEffect(() => {
    setAltDraft(selected?.alt ?? '')
    setWarn('')
  }, [selected?.id, selected?.alt])

  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE[view]))
  const pageItems = useMemo(
    () => items.slice((page - 1) * PAGE_SIZE[view], page * PAGE_SIZE[view]),
    [items, page, view]
  )

  /* 勾选范围默认是**当前页**（网格 12 / 列表 24 条），翻页或切分组即清空 —— 见 `useSelection`。
     此外还可以升级为「选中当前分组的全部」：那条路走 `filter` 而不是把 id 全传回来。 */
  const pageIds = useMemo(() => pageItems.map((i) => i.id), [pageItems])
  const sel = useSelection({ pageIds, total: items.length, filter: { kind } })

  const bulkSelected = useMemo(() => items.filter((i) => sel.has(i.id)), [items, sel.has, sel.count])

  /**
   * 弹层上的两个数：会删几个、会跳过几个。
   *
   * 两个判据（来源可否删、有没有被引用）都是服务端给的字段，前端只是把它们摆出来。
   * 提交时发的是**全部勾选的 id**：真正的判定归服务端，这里算错了也只是弹层上的
   * 数字不准，不会让一张还有引用的图被删掉。
   */
  const bulkDeletable = bulkSelected.filter((i) => removable(i) && i.referenceCount === 0)
  const bulkHeld = bulkSelected.length - bulkDeletable.length

  /*
   * 「删除」按钮要不要出现。
   *
   * 本页模式下按结算结果决定：一个都删不掉时不给按钮（正是因为这句话说得出，
   * 才有必要让它消失 —— 见下面弹层的 `none` 文案）。
   * 全选模式下屏幕上之外的那几十张是什么属性并不知道，此时宁可把按钮留着、
   * 由服务端逐条判定并带回清单，也不要为了「按钮干净」把一条能删的一起藏起来。
   */
  const bulkActions: 'delete'[] = sel.mode === 'all' || bulkDeletable.length > 0 ? ['delete'] : []

  const altDirty = selected ? altDraft.trim() !== selected.alt : false
  const activeKindLabel = kinds.find((k) => k.key === kind)?.label ?? ''
  const activeSortLabel = sorts.find((s) => s.value === sort)?.label ?? ''

  /* ----------------------------------------------------------- 写操作 */

  const acceptTypes = useMemo(
    () => new Set(policy.accept.split(',').filter(Boolean)),
    [policy.accept]
  )

  const upload = async (file: File) => {
    setNotice('')
    setWarn('')
    /* 体积与空文件在前端先拦：这两种必然失败，不值得跑一趟服务端。
       类型不在这里拦 —— 服务端那条错误消息会把允许的清单列全，比前端自己拼一句更准。 */
    if (file.size === 0) {
      setWarn(copy.upload.empty.replace('{name}', file.name))
      return
    }
    if (policy.maxBytes && file.size > policy.maxBytes) {
      setWarn(
        copy.upload.tooLarge
          .replace('{name}', file.name)
          .replace('{limit}', `${policy.maxBytes / 1024 / 1024}MB`)
      )
      return
    }
    if (acceptTypes.size && file.type && !acceptTypes.has(file.type)) {
      setWarn(
        copy.upload.wrongType.replace('{name}', file.name).replace('{hint}', policy.hint)
      )
      return
    }

    setUploading(true)
    try {
      const res = await adminApi.uploadMedia(file)
      setFacets(res)
      setSelectedId(res.item.id)
      setNotice(copy.upload.done.replace('{name}', res.item.filename))
      await load()
    } catch (err) {
      setWarn(err instanceof ApiError ? err.message : copy.upload.failed)
    } finally {
      setUploading(false)
    }
  }

  const onPickFiles = (list: FileList | null) => {
    const file = list?.[0]
    if (!file) return
    if (list && list.length > 1) setWarn(copy.upload.multiple.replace('{name}', file.name))
    void upload(file)
  }

  const saveAlt = async () => {
    if (!selected || !altDirty) return
    setSaving(true)
    setWarn('')
    setNotice('')
    try {
      const res = await adminApi.saveMedia(selected.id, { alt: altDraft.trim() })
      setFacets(res)
      setNotice(res.changed ? copy.detail.saved : copy.detail.noChange)
      await load()
    } catch (err) {
      setWarn(err instanceof ApiError ? err.message : copy.detail.saveError)
    } finally {
      setSaving(false)
    }
  }

  const confirmRemove = async () => {
    if (!removing) return
    setRemoveBusy(true)
    setWarn('')
    try {
      const res = await adminApi.deleteMedia(removing.id, removing.referenceCount > 0)
      setFacets(res)
      setNotice(copy.remove.done.replace('{name}', removing.filename))
      /* 只有「本该删掉磁盘文件的那一档」才谈得上没删掉：随构建发布的素材压根不删文件，
         对它报一句「请手动清理」是在让人去找一个删了也没用的东西。 */
      if (res.origin === 'upload' && !res.fileRemoved) setWarn(copy.remove.fileKept)
      setRemoving(null)
      setSelectedId(null)
      await load()
    } catch (err) {
      setWarn(err instanceof ApiError ? err.message : copy.remove.failed)
    } finally {
      setRemoveBusy(false)
    }
  }

  /** 批量删除。判定归服务端；被跳过的条目连同理由原样回带，逐条摆在提示条里。 */
  const runBulk = async () => {
    setBulkBusy(true)
    setWarn('')
    setNotice('')
    setBulkSkipped([])
    try {
      const res = await adminApi.bulkDeleteMedia(sel.scope())
      setFacets(res)
      setNotice(
        res.affected
          ? (res.skipped.length ? copy.bulk.doneWithSkips : copy.bulk.done)
              .replace('{done}', String(res.affected))
              .replace('{skipped}', String(res.skipped.length))
          : copy.bulk.none.replace('{n}', String(sel.count))
      )
      setBulkSkipped(res.skipped)
      setBulkOpen(false)
      /* 详情面板可能正停在刚被删掉的那一条上 —— 与其让它继续展示一个不存在的文件，不如收起来 */
      setSelectedId(null)
      sel.clear()
      await load()
    } catch (err) {
      if (err instanceof ApiError) {
        setWarn(err.message)
        /* 409：服务端算出的集合与界面不一致，列表多半已经变了 → 立刻重取 */
        if (err.status === 409) await load()
      } else {
        setWarn(copy.bulk.failed)
      }
    } finally {
      setBulkBusy(false)
    }
  }

  const copyLink = async () => {
    if (!selected) return
    const abs = `${window.location.origin}${selected.url}`
    try {
      await navigator.clipboard.writeText(abs)
      setNotice(copy.detail.copied)
    } catch {
      setWarn(copy.detail.copyFailed)
    }
  }

  /* ----------------------------------------------------------- 渲染 */

  return (
    <div className="flex min-h-full flex-col gap-[18px]">
      <PageHeader
        title={copy.title}
        subtitle={copy.subtitle}
        right={
          <>
            <UsagePill label={totalLabel} loading={loading && !data} />
            <HeaderButton
              icon={<ExternalIcon className="h-[14px] w-[14px]" />}
              onClick={() => window.open('/', '_blank', 'noopener,noreferrer')}
            >
              {copy.previewSite}
            </HeaderButton>
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
      {missingCount > 0 ? (
        <Notice tone="warn">
          {copy.card.missing}：{missingCount} 项 —— {copy.card.missingHint}
        </Notice>
      ) : null}

      <Toolbar
        left={
          <>
            <Chip active={kind === 'all'} onClick={() => setKind('all')}>
              {copy.kindAll}
              <ChipCount>{counts?.all ?? 0}</ChipCount>
            </Chip>
            {kinds.map((k) => (
              <Chip key={k.key} active={kind === k.key} onClick={() => setKind(k.key)}>
                {k.label}
                <ChipCount>{counts?.[k.key as MediaKind] ?? 0}</ChipCount>
              </Chip>
            ))}
          </>
        }
        right={
          <>
            <ViewToggle view={view} onChange={setView} />
            <ControlSelect
              value={sort}
              onChange={(next) => setSort(next as MediaSortKey)}
              options={sorts}
              ariaLabel="排序方式"
            />
          </>
        }
      />

      {/* 批量操作条：勾选项非空才出现，位置在筛选条与文件卡之间 */}
      {sel.count > 0 ? (
        <SelectionBar
          count={sel.count}
          label={copy.bulk.selected}
          clearLabel={copy.bulk.clear}
          onClear={sel.clear}
          hint={sel.mode === 'all' ? copy.bulk.allScopeHint : undefined}
          lead={
            sel.mode === 'page' && items.length > pageItems.length ? (
              <button
                type="button"
                onClick={sel.selectAllFiltered}
                className="font-cn text-[12px] leading-none text-[var(--color-primary)] underline-offset-2 hover:underline"
              >
                {copy.bulk.selectAllFiltered.replace('{n}', String(items.length))}
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
              {bulkActions.map((action) => (
                <Button
                  key={action}
                  variant="danger"
                  size="sm"
                  icon={<TrashIcon className="h-[13px] w-[13px]" />}
                  onClick={() => setBulkOpen(true)}
                >
                  {copy.bulk.actions[action].label}
                </Button>
              ))}
            </>
          }
        />
      ) : null}

      {/* 被跳过的条目逐条摆出来，理由（含来源原因）来自服务端回的 `skipped` */}
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

      {/* 主区一行：左文件卡 + 右详情面板。整行给定高度，让网格与面板各自内部滚动，
          而不是把整页推长 —— 否则选中文件后整页会跟着跳。 */}
      <div className="flex min-h-[520px] flex-1 items-stretch gap-[20px]">
        <AdminCard className="flex min-w-0 flex-1 flex-col">
          <CardHead
            title={kind === 'all' ? copy.card.title : copy.card.titleOf.replace('{kind}', activeKindLabel)}
            subtitle={
              kind === 'all'
                ? copy.card.subtitle.replace('{sort}', activeSortLabel)
                : copy.card.subtitleFiltered
                    .replace('{kind}', activeKindLabel)
                    .replace('{sort}', activeSortLabel)
            }
            right={
              <>
                {/* 全选（当前页）。文案带出来是为了可发现性 —— 一个孤零零的方框
                    在文件网格上很容易被当成装饰 */}
                <span className="flex items-center gap-[7px]">
                  <Checkbox
                    checked={sel.allSelected}
                    indeterminate={sel.partial}
                    disabled={pageItems.length === 0}
                    onChange={() => sel.toggleAll()}
                    label={copy.bulk.selectAll}
                  />
                  <span className="font-cn text-[11px] text-[var(--color-ink-3)]">
                    {copy.bulk.selectAll}
                  </span>
                </span>
                {/* 这颗胶囊说的是**勾选**的数量（也就是删除会影响到的那批），
                    不是右面板在看哪个文件 —— 后者面板自己会说（空态写着「从左侧选一个」） */}
                <span className="rounded-[12px] border border-[var(--color-line)] bg-[var(--admin-soft)] px-[11px] py-[5px] font-cn text-[11px] text-[var(--color-ink-2)]">
                  {sel.count > 0 ? copy.card.selected.replace('{n}', String(sel.count)) : copy.card.noSelection}
                </span>
              </>
            }
          />

          <div
            className={[
              'min-h-0 flex-1 overflow-y-auto p-[18px] transition-colors',
              dragOver ? 'bg-[var(--color-primary-soft)]/45' : '',
            ].join(' ')}
            onDragEnter={(e) => {
              e.preventDefault()
              dragDepth.current += 1
              setDragOver(true)
            }}
            onDragOver={(e) => {
              /* 不 preventDefault 的话浏览器会直接打开这个文件，页面被顶掉 */
              e.preventDefault()
              if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
            }}
            onDragLeave={() => {
              dragDepth.current = Math.max(0, dragDepth.current - 1)
              if (dragDepth.current === 0) setDragOver(false)
            }}
            onDrop={(e) => {
              e.preventDefault()
              dragDepth.current = 0
              setDragOver(false)
              onPickFiles(e.dataTransfer?.files ?? null)
            }}
          >
            {loading && !data ? (
              <SkeletonRows rows={6} height={72} />
            ) : (
              <>
                {view === 'grid' ? (
                  <div className="flex flex-wrap gap-[14px]">
                    <UploadTile
                      hint={policy.hint}
                      uploading={uploading}
                      dragOver={dragOver}
                      onClick={() => fileRef.current?.click()}
                    />
                    {pageItems.map((item) => (
                      <FileTile
                        key={item.id}
                        item={item}
                        active={item.id === selectedId}
                        checked={sel.has(item.id)}
                        onToggle={(on) => sel.toggle(item.id, on)}
                        onSelect={() => setSelectedId(item.id)}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col">
                    <button
                      type="button"
                      onClick={() => fileRef.current?.click()}
                      disabled={uploading}
                      className="mb-[10px] flex h-[52px] items-center justify-center gap-[8px] rounded-[10px] border border-dashed border-[var(--color-line)] bg-[var(--admin-soft)] font-cn text-[12px] text-[var(--color-ink-2)] transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] disabled:opacity-60"
                    >
                      <UploadGlyph className="h-[15px] w-[15px]" />
                      {uploading ? copy.upload.uploading : copy.upload.tile}
                    </button>
                    {pageItems.map((item) => (
                      <FileRow
                        key={item.id}
                        item={item}
                        active={item.id === selectedId}
                        checked={sel.has(item.id)}
                        onToggle={(on) => sel.toggle(item.id, on)}
                        onSelect={() => setSelectedId(item.id)}
                      />
                    ))}
                  </div>
                )}

                {items.length === 0 ? (
                  <EmptyState title={copy.card.empty} hint={copy.card.emptyHint} />
                ) : null}
              </>
            )}
          </div>

          <CardFoot left={totalLabel}>
            {/* 只有一页时不给翻页器：一个「1 / 1」加两个灰箭头是纯粹的噪声 */}
            {totalPages > 1 ? (
              <Pager page={page} totalPages={totalPages} onChange={setPage} />
            ) : null}
          </CardFoot>
        </AdminCard>

        <DetailPanel
          kindLabel={kind === 'all' ? '' : activeKindLabel}
          item={selected}
          altDraft={altDraft}
          altDirty={altDirty}
          altLimit={policy.maxAlt}
          saving={saving}
          loading={loading && !data}
          originLabel={selected ? (originRule(selected)?.label ?? '') : ''}
          /** 非空即表示这一档删不掉；文案（理由）由服务端下发，前端不自己编 */
          originHint={selected && !removable(selected) ? (originRule(selected)?.hint ?? '') : ''}
          onChangeAlt={(v) => {
            setAltDraft(v)
            setNotice('')
          }}
          onSave={() => void saveAlt()}
          onCopy={() => void copyLink()}
          onRemove={() => selected && setRemoving(selected)}
        />
      </div>

      <input
        ref={fileRef}
        type="file"
        accept={policy.accept}
        className="hidden"
        onChange={(e) => {
          onPickFiles(e.target.files)
          // 清空才能连续两次选同一个文件都触发 change
          e.target.value = ''
        }}
      />

      <ConfirmDialog
        open={Boolean(removing)}
        tone="danger"
        busy={removeBusy}
        title={copy.remove.title.replace('{name}', removing?.filename ?? '')}
        confirmLabel={
          removing && removing.referenceCount > 0 ? copy.remove.confirm : copy.remove.action
        }
        cancelLabel={copy.remove.cancel}
        message={
          <span className="flex flex-col gap-[10px]">
            <span>{copy.remove.message}</span>
            {removing && removing.referenceCount > 0 ? (
              <>
                <span>{copy.remove.referenced.replace('{n}', String(removing.referenceCount))}</span>
                <span className="flex flex-col gap-[6px] rounded-[10px] bg-[var(--admin-soft)] px-[12px] py-[10px]">
                  {removing.references.map((r) => (
                    <span key={`${r.type}-${r.id}`} className="font-cn text-[12px] text-[var(--color-ink-2)]">
                      · {r.label}
                      {r.note ? <span className="text-[var(--color-ink-3)]"> · {r.note}</span> : null}
                    </span>
                  ))}
                </span>
              </>
            ) : null}
          </span>
        }
        onConfirm={() => void confirmRemove()}
        onCancel={() => setRemoving(null)}
      />

      {/*
        批量确认。

        标题里的数量是**真正会被删掉的数量**（`bulkDeletable`），不是勾选总数：
        标题要说清「按下确认会发生什么」，被跳过的那几项由下面那句说明 ——
        它们为什么删不掉，则等操作之后由服务端逐条给出（那是判定的一部分，
        前端复述一份就多一个会说岔的地方）。
        一个都删不掉时按钮是灰的：与其让人点下去收到一句「没有可删除的文件」，
        不如在摆着原因的这一层就停住。
      */}
      <ConfirmDialog
        open={bulkOpen}
        tone="danger"
        busy={bulkBusy}
        title={copy.bulk.actions.delete.title.replace(
          '{n}',
          /* 全选模式下这一批有多少张是不知道的，这时给总数而不是一个看着精确的数 */
          String(sel.mode === 'all' ? sel.count : bulkDeletable.length)
        )}
        confirmLabel={copy.bulk.actions.delete.label}
        confirmDisabled={sel.mode === 'all' ? false : bulkDeletable.length === 0}
        cancelLabel={copy.remove.cancel}
        message={
          <span className="flex flex-col gap-[8px]">
            <span>
              {sel.mode === 'all' || bulkDeletable.length
                ? copy.bulk.actions.delete.message
                : copy.bulk.none.replace('{n}', String(sel.count))}
            </span>
            {sel.mode !== 'all' && bulkHeld > 0 ? (
              <span className="text-[var(--color-ink-3)]">
                {copy.bulk.skipNote
                  .replace('{hint}', copy.bulk.actions.delete.skipHint)
                  .replace('{n}', String(bulkHeld))}
              </span>
            ) : null}
          </span>
        }
        onConfirm={() => void runBulk()}
        onCancel={() => setBulkOpen(false)}
      />
    </div>
  )
}

/* --------------------------------------------------------------------- 瓦片 */

function UploadTile({
  hint,
  uploading,
  dragOver,
  onClick,
}: {
  hint: string
  uploading: boolean
  dragOver: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={uploading}
      className={[
        'flex h-[199px] w-[241px] shrink-0 flex-col items-center justify-center gap-[9px] rounded-[12px] border border-dashed p-[8px] text-center transition-colors',
        dragOver
          ? 'border-[var(--color-primary)] bg-[var(--color-primary-soft)]'
          : 'border-[var(--color-line)] bg-[var(--admin-soft)] hover:border-[var(--color-primary)]',
        uploading ? 'cursor-wait' : '',
      ].join(' ')}
    >
      <span className="flex h-[40px] w-[40px] items-center justify-center rounded-full bg-[var(--color-primary-soft)] text-[var(--color-primary)]">
        {uploading ? (
          <span className="h-[15px] w-[15px] animate-spin rounded-full border-[1.6px] border-current border-t-transparent" />
        ) : (
          <UploadGlyph className="h-[16px] w-[16px]" />
        )}
      </span>
      <span className="font-cn text-[12px] text-[var(--color-ink)]">
        {uploading ? copy.upload.uploading : dragOver ? copy.upload.release : copy.upload.tile}
      </span>
      <span className="font-latin text-[10px] text-[var(--color-ink-3)]">{hint}</span>
    </button>
  )
}

function Thumb({ item, className = '' }: { item: MediaItem; className?: string }) {
  if (item.missing) {
    return (
      <span
        className={[
          'flex items-center justify-center bg-[var(--admin-soft-strong)] text-[var(--color-ink-3)]',
          className,
        ].join(' ')}
        title={copy.card.missing}
      >
        <AlertIcon className="h-[16px] w-[16px]" />
      </span>
    )
  }
  return (
    <span className={['block overflow-hidden bg-[var(--admin-soft)]', className].join(' ')}>
      <img src={item.url} alt={item.alt} loading="lazy" className="h-full w-full object-cover" />
    </span>
  )
}

function FileTile({
  item,
  active,
  checked,
  onToggle,
  onSelect,
}: {
  item: MediaItem
  /** 右侧详情面板正在展示它 */
  active: boolean
  /** 批量勾选中 */
  checked: boolean
  onToggle: (on: boolean) => void
  onSelect: () => void
}) {
  return (
    <div
      data-media-id={item.id}
      className={[
        'relative flex h-[199px] w-[241px] shrink-0 flex-col gap-[8px] rounded-[12px] border p-[8px] transition-colors',
        /* 「勾选中」与「正在查看」用两个不同的信号：前者看左上角那个复选框与橙底，
           后者看描边。两者叠在同一个卡上时，仍能一眼分清是哪一种语义。 */
        checked
          ? 'border-[var(--color-primary)] bg-[var(--color-primary-soft)]'
          : active
            ? 'border-[var(--color-primary)] bg-[#fff9f7]'
            : 'border-[var(--color-line)] bg-[var(--admin-surface)] hover:border-[var(--color-primary)]',
      ].join(' ')}
    >
      {/* 勾选框与「点开详情」是**两个并列的按钮**，不是把一个 input 塞进 button 里 ——
          后者既不合规（button 里不许有交互内容），点起来也会同时触发两件事。
          所以勾选框用绝对定位浮在缩略图左上角、做卡片的兄弟节点。 */}
      <span className="absolute left-[15px] top-[15px] z-[1] flex h-[22px] w-[22px] items-center justify-center rounded-[7px] bg-white/85 backdrop-blur-[2px]">
        <Checkbox
          checked={checked}
          onChange={onToggle}
          label={copy.bulk.selectRow.replace('{name}', item.filename)}
        />
      </span>
      <button type="button" onClick={onSelect} className="block shrink-0 text-left">
        <Thumb item={item} className="h-[128px] w-full rounded-[8px]" />
      </button>
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={active}
        className="flex min-w-0 flex-col gap-[6px] text-left"
      >
        <span className="truncate font-latin text-[11px] text-[var(--color-ink)]">{item.filename}</span>
        <span className="flex items-center gap-[6px] font-cn text-[10px] text-[var(--color-ink-3)]">
          <span className="uppercase">{item.mime.split('/')[1] ?? copy.detail.unknown}</span>
          <span>·</span>
          <span>{item.bytesLabel}</span>
          {item.referenceCount > 0 ? (
            <>
              <span>·</span>
              <span>被引用 {item.referenceCount}</span>
            </>
          ) : null}
        </span>
      </button>
    </div>
  )
}

function FileRow({
  item,
  active,
  checked,
  onToggle,
  onSelect,
}: {
  item: MediaItem
  active: boolean
  checked: boolean
  onToggle: (on: boolean) => void
  onSelect: () => void
}) {
  return (
    <div
      data-media-id={item.id}
      className={[
        'flex items-center gap-[12px] rounded-[10px] px-[10px] py-[8px] transition-colors',
        checked
          ? 'bg-[var(--color-primary-soft)]'
          : active
            ? 'bg-[var(--color-primary-soft)]/45'
            : 'hover:bg-[var(--admin-soft)]',
      ].join(' ')}
    >
      <Checkbox
        checked={checked}
        onChange={onToggle}
        label={copy.bulk.selectRow.replace('{name}', item.filename)}
      />
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={active}
        className="flex min-w-0 flex-1 items-center gap-[12px] text-left"
      >
        <Thumb item={item} className="h-[38px] w-[52px] shrink-0 rounded-[6px]" />
        <span className="min-w-0 flex-1 truncate font-latin text-[12px] text-[var(--color-ink)]">
          {item.filename}
        </span>
        <span className="shrink-0 font-cn text-[11px] text-[var(--color-ink-3)]">{item.bytesLabel}</span>
        <span className="w-[64px] shrink-0 text-right font-cn text-[11px] text-[var(--color-ink-3)]">
          {item.referenceCount > 0 ? `引用 ${item.referenceCount}` : copy.detail.unknown}
        </span>
      </button>
    </div>
  )
}

/* --------------------------------------------------------------------- 详情 */

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-[12px]">
      <span className="font-cn text-[11px] text-[var(--color-ink-3)]">{label}</span>
      <span className="truncate font-cn text-[11.5px] text-[var(--color-ink-2)]">{value}</span>
    </div>
  )
}

function DetailPanel({
  kindLabel,
  item,
  altDraft,
  altDirty,
  altLimit,
  saving,
  loading,
  originLabel,
  originHint,
  onChangeAlt,
  onSave,
  onCopy,
  onRemove,
}: {
  kindLabel: string
  item: MediaItem | null
  altDraft: string
  altDirty: boolean
  /** 上限来自服务端下发的上传策略，与后端拒收用的是同一个数 */
  altLimit: number
  saving: boolean
  loading: boolean
  /** 来源档的中文名，来自服务端下发的 `policy.origins` */
  originLabel: string
  /** 非空表示这一档删不掉 —— 它就是理由，直接上屏，界面不自己编一句话 */
  originHint: string
  onChangeAlt: (value: string) => void
  onSave: () => void
  onCopy: () => void
  onRemove: () => void
}) {
  return (
    <AdminCard className="flex w-[320px] shrink-0 flex-col">
      <header className="flex items-center justify-between gap-[12px] px-[18px] py-[14px]">
        <div className="flex min-w-0 flex-col gap-[3px]">
          <h2 className="font-cn text-[13px] font-semibold leading-none text-[var(--color-ink)]">
            {copy.detail.title}
          </h2>
          <p className="truncate font-cn text-[10.5px] text-[var(--color-ink-3)]">
            {kindLabel
              ? copy.detail.subtitleOf.replace('{kind}', kindLabel)
              : copy.detail.subtitle}
          </p>
        </div>
        {item ? (
          <span className="shrink-0 rounded-[8px] bg-[var(--admin-soft)] px-[8px] py-[4px] font-latin text-[10px] uppercase text-[var(--color-ink-3)]">
            {item.mime.split('/')[1] ?? copy.detail.unknown}
          </span>
        ) : null}
      </header>
      <Divider />

      {loading ? (
        <div className="flex flex-1 items-center justify-center px-[18px] py-[40px] font-cn text-[12px] text-[var(--color-ink-3)]">
          {copy.usage.loading}
        </div>
      ) : !item ? (
        <EmptyState title={copy.detail.empty} hint={copy.detail.emptyHint} />
      ) : (
        <>
          <div className="flex min-h-0 flex-1 flex-col gap-[14px] overflow-y-auto px-[18px] py-[16px]">
            <span className="flex h-[138px] items-center justify-center overflow-hidden rounded-[12px] border border-[var(--color-line)] bg-[var(--admin-soft)]">
              {item.missing ? (
                <span className="flex flex-col items-center gap-[6px] px-[16px] text-center">
                  <AlertIcon className="h-[18px] w-[18px] text-[var(--color-ink-3)]" />
                  <span className="font-cn text-[11px] leading-[1.6] text-[var(--color-ink-3)]">
                    {copy.card.missing}
                  </span>
                </span>
              ) : (
                <img src={item.url} alt={item.alt} className="h-full w-full object-contain" />
              )}
            </span>

            {/* 文件名只读：改名要同时动磁盘文件、库、以及四处引用，
                所以理由写在框下面，而不是让人对着一个灰框猜 */}
            <Field label={copy.detail.fieldFilename} hint={copy.detail.altHintReadonly}>
              <ReadonlyValue>{item.filename}</ReadonlyValue>
            </Field>

            {/*
              替代文本是这一屏唯一可写的字段，保存入口就放在这一行的右上角：
              它只影响这一个字段，放到面板底部与「复制链接 / 删除」并列，
              会让人以为那是一个页面级的提交。
            */}
            <Field
              label={copy.detail.fieldAlt}
              hint={copy.detail.altHint}
              right={
                <span className="flex items-center gap-[8px]">
                  <span className="font-latin text-[10.5px] text-[var(--color-ink-3)]">
                    {copy.detail.altCount
                      .replace('{n}', String(altDraft.length))
                      .replace('{max}', String(altLimit))}
                  </span>
                  {altDirty ? (
                    <button
                      type="button"
                      disabled={saving}
                      onClick={onSave}
                      className="font-cn text-[10.5px] font-medium text-[var(--color-primary)] underline-offset-2 hover:underline disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {saving ? copy.detail.saving : copy.detail.save}
                    </button>
                  ) : null}
                </span>
              }
            >
              <TextInput
                value={altDraft}
                placeholder={copy.detail.altPlaceholder}
                onChange={(e) => onChangeAlt(e.target.value)}
              />
            </Field>

            <div className="flex flex-col gap-[9px] rounded-[12px] bg-[var(--admin-soft)] px-[14px] py-[14px]">
              <MetaRow label={copy.origin.field} value={originLabel || copy.detail.unknown} />
              <MetaRow
                label={copy.detail.meta.size}
                value={
                  item.width && item.height
                    ? `${item.width} × ${item.height}`
                    : copy.detail.unknown
                }
              />
              <MetaRow label={copy.detail.meta.bytes} value={item.bytesLabel} />
              <MetaRow label={copy.detail.meta.format} value={item.mime || copy.detail.unknown} />
              <MetaRow label={copy.detail.meta.uploaded} value={formatWhen(item.createdAt)} />
            </div>

            {/* 删不掉的那一档：把理由摆在删除按钮的同一屏里，而不是让人点一下
                再收到一条 409。这句话不是前端写的 —— 它来自服务端下发的来源策略 */}
            {originHint ? (
              <div className="flex flex-col gap-[6px] rounded-[12px] border border-[#f0e0c8] bg-[#fdf8ef] px-[14px] py-[12px]">
                <span className="font-cn text-[11.5px] font-medium text-[#a8611a]">
                  {copy.remove.blockedTitle}
                </span>
                <span className="font-cn text-[11px] leading-[1.7] text-[#a8611a] opacity-85">
                  {originHint}
                </span>
              </div>
            ) : null}

            <div className="flex flex-col gap-[8px] rounded-[12px] bg-[var(--admin-soft)] px-[14px] py-[14px]">
              <div className="flex items-center justify-between gap-[10px]">
                <span className="font-cn text-[11.5px] font-medium text-[var(--color-ink-2)]">
                  {item.referenceCount > 0
                    ? copy.detail.usageTitle.replace('{n}', String(item.referenceCount))
                    : copy.detail.usageNone}
                </span>
              </div>
              {item.referenceCount === 0 ? (
                <span className="font-cn text-[11px] text-[var(--color-ink-3)]">
                  {copy.detail.usageHint}
                </span>
              ) : (
                item.references.map((r) => (
                  <a
                    key={`${r.type}-${r.id}`}
                    href={r.href}
                    className="font-cn text-[11px] leading-[1.6] text-[var(--color-ink-3)] transition-colors hover:text-[var(--color-primary)]"
                  >
                    · {r.label}
                    {r.note ? <span className="opacity-70"> · {r.note}</span> : null}
                  </a>
                ))
              )}
            </div>
          </div>

          <Divider />
          <footer className="flex items-center gap-[10px] px-[18px] py-[14px]">
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              icon={<CopyIcon className="h-[13px] w-[13px]" />}
              onClick={onCopy}
            >
              {copy.detail.copy}
            </Button>
            <Button
              variant="danger"
              size="sm"
              icon={<TrashIcon className="h-[13px] w-[13px]" />}
              disabled={Boolean(originHint)}
              title={originHint || undefined}
              onClick={onRemove}
            >
              {copy.remove.action}
            </Button>
          </footer>
        </>
      )}
    </AdminCard>
  )
}