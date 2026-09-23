/**
 * 文章编辑器（画布 `13:481 后台 · 文章编辑 / Editor`）。
 *
 * 四处取舍写在前头 —— 它们都不是「照着画布描一遍」能得出的结论：
 *
 * 1. **保存是显式的，不做自动保存。** 画布的状态行写的是「草稿 · 自动保存于 2 分钟前」。
 *    但本后台每次保存都会写一条操作日志（`post_save`）。自动保存会把日志刷成一片
 *    「保存文章 · 正文」，真正需要追溯的那次改动会被淹没。因此保存由作者触发
 *    （⌘S 或按钮），状态行如实显示「已保存 · 18:42」「有未保存的修改」。
 *    宁可少一个体贴的功能，也不写一句不成立的状态说明。
 * 2. **新建不落库。** 点「新建文章」只是打开一张空表，首次保存才 POST。
 *    反过来做（一进页面就建草稿）的话，每次点开又退出都会在列表里留下一条空草稿。
 * 3. **正文是「编辑 / 预览」双模。** 画布把正文画成了渲染后的样子，那是阅读效果；
 *    但编辑器首先要能打字。默认进编辑态，工具条按钮在预览态被点击时会自动切回编辑态
 *    再插入 —— 不出现「按了没反应」的死按钮。
 * 4. **草稿没有预览。** 前台只读已发布的文章（`/api/content` 只出 published），
 *    而服务端没有签发「草稿预览」凭据的通道，所以草稿态的预览按钮是禁用的并说明原因，
 *    而不是打开一个必然 404 的地址。要做草稿预览，得先有带签名的一次性预览链接。
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { adminPostEditorCopy as copy } from '../../data/admin'
import {
  ApiError,
  adminApi,
  type PostDetail,
  type PostSavePayload,
  type PostStatus,
} from '../adminApi'
import {
  ArrowLeftIcon,
  BoldIcon,
  ChevronDownIcon,
  CodeIcon,
  CopyIcon,
  EyeIcon,
  HeadingIcon,
  ItalicIcon,
  LinkIcon,
  ListIcon,
  QuoteIcon,
  SaveIcon,
  TrashIcon,
  UndoIcon,
} from '../AdminIcons'
import { MarkdownBody } from '../../lib/markdown'
import {
  Button,
  ConfirmDialog,
  Notice,
  PostStatusBadge,
  RowMenu,
  SkeletonRows,
  type RowAction,
} from '../ui'

/* ------------------------------------------------------------------ 表单状态 */
/** 编辑器管辖的字段集合。`status` 刻意不在其中：它走列表页那条独立分支与独立审计码。 */
interface FormState {
  title: string
  slug: string
  excerpt: string
  category: string
  body: string
  tags: string[]
  coverImage: string
  seoDescription: string
}

const BLANK: FormState = {
  title: '',
  slug: '',
  excerpt: '',
  category: '',
  body: '',
  tags: [],
  coverImage: '',
  seoDescription: '',
}

function fromPost(post: PostDetail): FormState {
  return {
    title: post.title,
    slug: post.slug,
    excerpt: post.excerpt,
    category: post.category,
    body: post.body,
    tags: post.tags,
    coverImage: post.coverImage ?? '',
    seoDescription: post.seoDescription,
  }
}

const sameTags = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((t, i) => t === b[i])

const sameForm = (a: FormState, b: FormState) =>
  a.title === b.title &&
  a.slug === b.slug &&
  a.excerpt === b.excerpt &&
  a.category === b.category &&
  a.body === b.body &&
  a.coverImage === b.coverImage &&
  a.seoDescription === b.seoDescription &&
  sameTags(a.tags, b.tags)

/**
 * 只提交**改动过的**字段。
 *
 * 这不是省流量，而是为了审计文案：全量提交时 `post_save` 的 detail 会列出
 * 「标题、正文、分类、标签…」，作者只改了一个错别字也会显得改了整篇。
 */
function buildPatch(form: FormState, base: FormState): PostSavePayload {
  const patch: PostSavePayload = {}
  if (form.title !== base.title) patch.title = form.title.trim()
  if (form.slug !== base.slug) patch.slug = form.slug.trim()
  if (form.excerpt !== base.excerpt) patch.excerpt = form.excerpt
  if (form.category !== base.category) patch.category = form.category
  if (form.body !== base.body) patch.body = form.body
  if (form.seoDescription !== base.seoDescription) patch.seoDescription = form.seoDescription.trim() || null
  if (form.coverImage !== base.coverImage) patch.coverImage = form.coverImage.trim() || null
  if (!sameTags(form.tags, base.tags)) patch.tags = form.tags
  return patch
}

/** 新建时的首次提交：只送非空字段，让服务端按缺省值兜底（slug 由标题派生）。 */
function buildCreate(form: FormState): PostSavePayload {
  const payload: PostSavePayload = { title: form.title.trim() }
  if (form.slug.trim()) payload.slug = form.slug.trim()
  if (form.excerpt) payload.excerpt = form.excerpt
  if (form.category) payload.category = form.category
  if (form.body) payload.body = form.body
  if (form.seoDescription.trim()) payload.seoDescription = form.seoDescription.trim()
  if (form.coverImage.trim()) payload.coverImage = form.coverImage.trim()
  if (form.tags.length) payload.tags = form.tags
  return payload
}

/* ------------------------------------------------------------------ 主组件 */
export default function AdminPostEditor() {
  const { id: idParam } = useParams()
  const nav = useNavigate()
  const parsedId = idParam && idParam !== 'new' ? Number.parseInt(idParam, 10) : null
  const postId = parsedId !== null && Number.isInteger(parsedId) && parsedId > 0 ? parsedId : null
  /** 路径是 `/admin/posts/abc` 这种非法 id：不当作新建，直接按「不存在」处理 */
  const invalidPath = idParam !== undefined && idParam !== 'new' && postId === null

  const [post, setPost] = useState<PostDetail | null>(null)
  const [form, setForm] = useState<FormState>(BLANK)
  const [base, setBase] = useState<FormState>(BLANK)
  const [status, setStatus] = useState<PostStatus>('draft')
  const [categories, setCategories] = useState<string[]>([])
  const [allTags, setAllTags] = useState<string[]>([])
  const [author, setAuthor] = useState('')

  const [loading, setLoading] = useState(postId !== null)
  const [loadError, setLoadError] = useState('')
  const [missing, setMissing] = useState(invalidPath)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState<{ tone: 'info' | 'error' | 'success'; text: string } | null>(null)
  const [tab, setTab] = useState<'edit' | 'preview'>('edit')
  const [savedAt, setSavedAt] = useState('')
  /** 取数失败后点「重试」时 +1，用来重跑下面的取数 effect */
  const [reloadKey, setReloadKey] = useState(0)
  const [tagInput, setTagInput] = useState('')
  const [tagOpen, setTagOpen] = useState(false)
  const [coverDraft, setCoverDraft] = useState('')
  const [pendingTrash, setPendingTrash] = useState(false)
  const [pendingRemove, setPendingRemove] = useState(false)

  /**
   * 记住「这份数据是从哪个 id 取回来的」。
   * 新建成功后我们会 `nav(..., replace)` 到带 id 的地址，路由参数一变就会触发下面的
   * 取数 effect —— 那时数据就在手里，再取一次只会让表单闪一下加载态。
   */
  const loadedIdRef = useRef<number | null>(null)
  const bodyRef = useRef<HTMLTextAreaElement | null>(null)
  /** react-router 的 navigate 引用是稳定的，但放进依赖数组没必要，故用 ref 拿最新值 */
  const navRef = useRef(nav)
  navRef.current = nav

  /* ------------------------------------------------------------- 取数 */
  useEffect(() => {
    if (postId === null) {
      loadedIdRef.current = null
      setPost(null)
      setForm(BLANK)
      setBase(BLANK)
      setStatus('draft')
      setSavedAt('')
      setLoading(false)
      setLoadError('')
      setMissing(invalidPath)
      return
    }
    if (loadedIdRef.current === postId) return

    const signal = { cancelled: false }
    setLoading(true)
    setLoadError('')
    setMissing(false)

    adminApi
      .post(postId)
      .then((res) => {
        if (signal.cancelled) return
        const next = fromPost(res.post)
        setPost(res.post)
        setForm(next)
        setBase(next)
        setStatus(res.post.status)
        setCategories(res.categories)
        setAllTags(res.allTags)
        setAuthor(res.author)
        setSavedAt(res.post.updatedAt)
        loadedIdRef.current = res.post.id
      })
      .catch((err) => {
        if (signal.cancelled) return
        if (err instanceof ApiError && err.status === 404) setMissing(true)
        else setLoadError(err instanceof ApiError ? err.message : copy.loadError)
      })
      .finally(() => {
        if (!signal.cancelled) setLoading(false)
      })

    return () => {
      signal.cancelled = true
    }
  }, [postId, invalidPath, reloadKey])

  const dirty = useMemo(() => !sameForm(form, base), [form, base])

  /** 有未保存的改动时拦住刷新 / 关标签页。站内跳转不拦 —— 那会让「返回列表」变成一次确认弹层。 */
  useEffect(() => {
    if (!dirty) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = copy.leave
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirty])

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const applyPost = (next: PostDetail) => {
    const value = fromPost(next)
    setPost(next)
    setForm(value)
    setBase(value)
    setStatus(next.status)
    setSavedAt(next.updatedAt)
  }

  /* ------------------------------------------------------------- 保存 */
  async function save(): Promise<PostDetail | null> {
    if (saving) return null
    if (!form.title.trim()) {
      setNotice({ tone: 'error', text: '标题不能为空' })
      return null
    }

    setSaving(true)
    setNotice(null)
    try {
      if (postId === null) {
        const res = await adminApi.createPost(buildCreate(form))
        applyPost(res.post)
        // 新建时若带了库里没有的分类，服务端会拒；能走到这里说明分类一定已存在，
        // 仍补一次下拉（服务端建标签时顺手建的分类不在其中，这里只是兜底）
        setCategories((prev) => (prev.includes(res.post.category) || !res.post.category ? prev : [...prev, res.post.category]))
        setNotice({ tone: 'success', text: copy.created.replace('{title}', res.post.title) })
        // 换成带 id 的地址：此后刷新、收藏、复制链接都能回到同一篇
        loadedIdRef.current = res.post.id
        navRef.current(`/admin/posts/${res.post.id}`, { replace: true })
        return res.post
      }

      const patch = buildPatch(form, base)
      if (!Object.keys(patch).length) {
        setNotice({ tone: 'info', text: copy.idle })
        return post
      }

      const res = await adminApi.savePost(postId, patch)
      applyPost(res.post)
      setNotice({
        tone: 'success',
        text: copy.saved.replace('{fields}', res.fields?.length ? res.fields.join('、') : copy.idle),
      })
      return res.post
    } catch (err) {
      setNotice({ tone: 'error', text: err instanceof ApiError ? err.message : copy.saveError })
      return null
    } finally {
      setSaving(false)
    }
  }

  /**
   * 状态流转。
   *
   * 接收显式的 id 而不是读 `postId`：新建后「保存并发布」是一次点击发起的，
   * 那时闭包里的 `postId` 还是 null，而文章已经建好了。
   *
   * `latest` 是同一个道理的另一半：`handlePrimary` 里是「先 `save()` 再改状态」，
   * 而 `save()` 只是把新值排进 state，本函数闭包里的 `post` 仍是**上一次渲染的快照**。
   * 拿那份旧快照重建表单，就会把刚保存的改动整片抹回去 —— 库里已经改了、界面却退回
   * 改动前（实测：移除封面 → 保存成草稿 → 封面又回到预览里）。所以调用方刚拿到
   * 最新数据时把它传进来；没传说明没有更新的数据，用当前 `post` 即可。
   */
  async function changeStatus(
    id: number,
    next: PostStatus,
    latest?: PostDetail | null
  ): Promise<PostDetail | null> {
    if (saving) return null
    setSaving(true)
    setNotice(null)
    try {
      const res = await adminApi.updatePostStatus(id, next)
      const source = latest ?? post
      const merged = source ? { ...source, ...pickStatus(res.post) } : null
      if (merged) applyPost(merged)
      else setStatus(res.post.status)
      if (next === 'trash') setNotice({ tone: 'info', text: copy.trashed.replace('{title}', res.post.title) })
      return merged
    } catch (err) {
      setNotice({ tone: 'error', text: err instanceof ApiError ? err.message : '状态更新失败' })
      return null
    } finally {
      setSaving(false)
    }
  }

  /** 主按钮：草稿 → 发布；已发布 → 转草稿；回收站 → 移出来。 */
  async function handlePrimary() {
    if (status === 'trash') {
      if (postId !== null) await changeStatus(postId, 'draft')
      return
    }
    let targetId = postId
    /** 本次刚保存出来的那份数据，交给 `changeStatus` 用，见其说明 */
    let latest: PostDetail | null = null
    if (dirty || postId === null) {
      const saved = await save()
      if (!saved) return
      targetId = saved.id
      latest = saved
    }
    if (targetId === null) return
    await changeStatus(targetId, status === 'published' ? 'draft' : 'published', latest)
  }

  /** 预览：先把未保存的改动落库，否则看到的还是上一版。 */
  async function openPreview() {
    if (status === 'trash') return
    let target = post
    if (dirty || postId === null) target = await save()
    if (!target) return
    if (target.status !== 'published') {
      setNotice({ tone: 'info', text: copy.previewBlocked })
      return
    }
    window.open(`/blog/${encodeURIComponent(target.slug)}`, '_blank', 'noopener')
  }

  async function copyLink() {
    if (!post) return
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/blog/${post.slug}`)
      setNotice({ tone: 'success', text: copy.copied })
    } catch {
      setNotice({ tone: 'error', text: '复制失败，请手动从地址栏复制' })
    }
  }

  async function removeForever() {
    if (postId === null) return
    setSaving(true)
    try {
      await adminApi.deletePost(postId)
      navRef.current('/admin/posts', { replace: true })
    } catch (err) {
      setNotice({ tone: 'error', text: err instanceof ApiError ? err.message : '删除失败' })
    } finally {
      setSaving(false)
    }
  }

  /* ------------------------------------------------------- 正文工具条插入 */
  /**
   * 工具条按下的效果分两类：
   *   - 行内包裹（加粗 / 斜体 / 链接）：把选中的文字包起来，没选中就插入占位词并选中它
   *   - 整段前缀（小标题 / 引用 / 列表 / 代码块）：给选中的每一行加前缀，空选区时作用于当前行
   * 这样「先选中再按」和「直接按」都有合理结果，不需要作者先学一套规矩。
   */
  const selRef = useRef<[number, number] | null>(null)

  /**
   * 恢复光标位置要用 layout effect（在浏览器绘制前落位），但 `useLayoutEffect`
   * 在服务端渲染时会告警、且不执行。服务端没有可落位的光标，退回 `useEffect` 即可 ——
   * 这是 React 官方给 SSR 场景的写法，不改变 hook 的调用顺序。
   */
  const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

  useIsoLayoutEffect(() => {
    const el = bodyRef.current
    const sel = selRef.current
    if (!el || !sel) return
    selRef.current = null
    el.focus()
    el.setSelectionRange(sel[0], sel[1])
  }, [form.body])

  type InsertOp =
    | { kind: 'wrap'; token: string; placeholder: string }
    | { kind: 'link' }
    | { kind: 'lines'; prefix: string; placeholder: string }
    | { kind: 'fence' }

  const pendingRef = useRef<InsertOp | null>(null)

  function runInsert(op: InsertOp) {
    const el = bodyRef.current
    if (!el) return
    const value = el.value
    const start = el.selectionStart
    const end = el.selectionEnd
    const selected = value.slice(start, end)

    if (op.kind === 'wrap') {
      const inner = selected || op.placeholder
      const next = `${value.slice(0, start)}${op.token}${inner}${op.token}${value.slice(end)}`
      selRef.current = [start + op.token.length, start + op.token.length + inner.length]
      setField('body', next)
      return
    }

    /*
     * 链接单独一套，套不进通用的「两侧加同一个符号」：
     * 需要 `[文字](地址)` 这种两侧不同的包裹，且落点应停在地址上 ——
     * 作者按下链接按钮后下一步一定是粘地址，不该再让他自己找位置。
     */
    if (op.kind === 'link') {
      const label = selected || '链接文字'
      const url = 'https://'
      const next = `${value.slice(0, start)}[${label}](${url})${value.slice(end)}`
      const urlStart = start + label.length + 3
      selRef.current = [urlStart, urlStart + url.length]
      setField('body', next)
      return
    }

    if (op.kind === 'fence') {
      // 围栏必须独占整行：前后各留出换行，否则会粘进上一段里
      const lineStart = value.lastIndexOf('\n', start - 1) + 1
      const before = value.slice(0, lineStart)
      const lead = before === '' || before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n'
      const inner = selected || '在这里写代码'
      const next = `${before}${lead}\`\`\`\n${inner}\n\`\`\`\n${value.slice(end)}`
      // 落点 = 开头 + 前置换行 + 三根围栏 + 一个换行
      const caret = before.length + lead.length + 4
      selRef.current = [caret, caret + inner.length]
      setField('body', next)
      return
    }

    /*
     * 整段前缀（小标题 / 引用 / 列表）。
     * 选区覆盖的每一行都加前缀；同一段再按一次则整段去掉前缀 ——
     * 否则列表越按嵌套越深，只能手工删。
     */
    const lineStart = value.lastIndexOf('\n', start - 1) + 1
    const lineEndIdx = value.indexOf('\n', end)
    const blockEnd = lineEndIdx === -1 ? value.length : lineEndIdx
    const lines = value.slice(lineStart, blockEnd).split('\n')
    const already = lines.every((l) => l.startsWith(op.prefix))
    const nextBlock = already
      ? lines.map((l) => l.slice(op.prefix.length)).join('\n')
      : lines.map((l) => `${op.prefix}${l || (lines.length === 1 ? op.placeholder : '')}`).join('\n')
    const next = `${value.slice(0, lineStart)}${nextBlock}${value.slice(blockEnd)}`
    const delta = already ? -op.prefix.length : op.prefix.length
    selRef.current = [Math.max(lineStart, start + delta), Math.max(lineStart, end + delta * lines.length)]
    setField('body', next)
  }

  /** 预览态下按工具条：先切回编辑态，等文本框真的挂上去再插入。 */
  function insert(op: InsertOp) {
    if (tab !== 'edit') {
      pendingRef.current = op
      setTab('edit')
      return
    }
    runInsert(op)
  }

  useEffect(() => {
    if (tab !== 'edit') return
    const pending = pendingRef.current
    if (!pending) return
    pendingRef.current = null
    runInsert(pending)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])

  /* ------------------------------------------------------------- 渲染分支 */
  if (loading) {
    return (
      <div className="flex h-full flex-col gap-[16px] px-[32px] py-[24px]">
        <p className="font-cn text-[12.5px] text-[var(--color-ink-3)]">{copy.loading}</p>
        <SkeletonRows rows={6} height={56} />
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="flex h-full flex-col items-start gap-[14px] px-[32px] py-[24px]">
        <Notice tone="error">{loadError}</Notice>
        <div className="flex gap-[10px]">
          <Button variant="outline" onClick={() => nav('/admin/posts')}>
            {copy.back}
          </Button>
          <Button
            onClick={() => {
              /* 清掉「这份数据已取过」的记认，再把 effect 顶一次 */
              loadedIdRef.current = null
              setReloadKey((n) => n + 1)
            }}
          >
            {copy.retry}
          </Button>
        </div>
      </div>
    )
  }

  if (missing) {
    return (
      <div className="flex h-full flex-col items-start gap-[14px] px-[32px] py-[24px]">
        <p className="font-cn text-[13px] text-[var(--color-ink-2)]">{copy.notFound}</p>
        <Button variant="outline" onClick={() => nav('/admin/posts')}>
          {copy.back}
        </Button>
      </div>
    )
  }

  const statusLabel = copy.statusLabels[status]
  const primaryLabel =
    status === 'trash' ? copy.restore : status === 'published' ? copy.unpublish : copy.publish
  const canPreview = status === 'published'

  const moreActions: RowAction[] = [
    {
      key: 'copy',
      label: copy.copyLink,
      icon: <CopyIcon className="h-[14px] w-[14px]" />,
      disabled: !post,
      title: post ? undefined : '保存之后才有链接',
      onSelect: () => void copyLink(),
    },
    ...(status === 'trash'
      ? [
          { key: 'restore', label: copy.restore, icon: <UndoIcon className="h-[14px] w-[14px]" />, onSelect: () => void handlePrimary() },
          { key: 'remove', label: copy.remove, icon: <TrashIcon className="h-[14px] w-[14px]" />, danger: true, onSelect: () => setPendingRemove(true) },
        ]
      : [
          { key: 'trash', label: copy.trash, icon: <TrashIcon className="h-[14px] w-[14px]" />, disabled: !post, title: post ? undefined : '先保存再移入回收站', onSelect: () => setPendingTrash(true) },
        ]),
  ]

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* ------------------------------------------------------------- 顶栏 */}
      <header className="flex h-[64px] shrink-0 items-center gap-[14px] border-b border-[var(--color-line)] px-[24px]">
        <button
          type="button"
          onClick={() => nav('/admin/posts')}
          aria-label={copy.back}
          title={copy.back}
          className="inline-flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full border border-[var(--color-line)] text-[var(--color-ink-2)] transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
        >
          <ArrowLeftIcon className="h-[16px] w-[16px]" />
        </button>

        <div className="flex min-w-0 flex-col gap-[3px]">
          <span className="font-cn text-[13.5px] font-semibold leading-none text-[var(--color-ink)]">
            {postId === null ? copy.create : copy.edit}
          </span>
          <span className="truncate font-cn text-[11px] leading-none text-[var(--color-ink-3)]">
            {statusLabel}
            {' · '}
            {dirty ? copy.unsaved : savedAt ? copy.savedAt.replace('{time}', clockOf(savedAt)) : copy.neverSaved}
            {' · '}
            {copy.shortcut}
          </span>
        </div>

        <span className="flex-1" />

        <button
          type="button"
          onClick={() => void openPreview()}
          disabled={!canPreview}
          title={canPreview ? undefined : copy.previewBlocked}
          className="inline-flex h-[36px] shrink-0 items-center gap-[7px] rounded-full border border-[var(--color-line)] px-[15px] font-cn text-[12.5px] font-medium text-[var(--color-ink-2)] transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] disabled:cursor-not-allowed disabled:border-[var(--color-line)] disabled:text-[var(--admin-placeholder)]"
        >
          <EyeIcon className="h-[15px] w-[15px]" />
          {copy.preview}
        </button>

        <RowMenu actions={moreActions} label={copy.more} size="md" />

        <Button onClick={() => void handlePrimary()} loading={saving} disabled={saving}>
          {primaryLabel}
        </Button>
      </header>

      {/* ------------------------------------------------------------- 主体 */}
      <div className="flex min-h-0 flex-1">
        {/* --------------------------------------------------- 左：编辑器列 */}
        <div className="flex min-w-0 flex-1 flex-col gap-[16px] overflow-y-auto px-[32px] pb-[28px] pt-[24px]">
          {notice ? (
            <Notice tone={notice.tone} onClose={() => setNotice(null)}>
              {notice.text}
            </Notice>
          ) : null}
          {status === 'trash' ? (
            <Notice tone="warn">
              这篇文章在回收站里，前台已经看不到它了。移出回收站会回到草稿状态。
            </Notice>
          ) : null}

          {/* 标题 */}
          <label className="flex flex-col gap-[8px]">
            <span className="font-cn text-[12px] font-medium text-[var(--color-ink-3)]">
              {copy.labelTitle}
            </span>
            <input
              value={form.title}
              onChange={(e) => setField('title', e.target.value)}
              placeholder="写一个说清这篇文章在讲什么的标题"
              aria-label={copy.labelTitle}
              className="w-full rounded-[12px] border border-[var(--color-line)] bg-[var(--admin-surface)] px-[18px] py-[14px] font-cn text-[21px] font-semibold leading-[1.4] text-[var(--color-ink)] outline-none transition-colors placeholder:text-[var(--admin-placeholder)] placeholder:font-normal focus:border-[var(--color-primary)]"
            />
          </label>

          {/* 永久链接 */}
          <label className="flex flex-col gap-[8px]">
            <span className="font-cn text-[12px] font-medium text-[var(--color-ink-3)]">
              {copy.labelSlug}
              <span className="ml-[8px] text-[10.5px] text-[var(--admin-placeholder)]">{copy.slugRule}</span>
            </span>
            <span className="flex h-[44px] w-full items-center gap-[1px] rounded-[12px] border border-[var(--color-line)] bg-[var(--admin-surface)] px-[16px] focus-within:border-[var(--color-primary)]">
              <span className="shrink-0 font-latin text-[12.5px] text-[var(--admin-placeholder)]">
                {copy.slugPrefix}
              </span>
              <input
                value={form.slug}
                onChange={(e) => setField('slug', e.target.value)}
                placeholder={post ? '' : '保存时按标题自动生成'}
                aria-label={copy.labelSlug}
                className="min-w-0 flex-1 bg-transparent font-latin text-[13px] font-medium text-[var(--color-ink)] outline-none placeholder:font-cn placeholder:font-normal placeholder:text-[var(--admin-placeholder)]"
              />
            </span>
          </label>

          {/* 摘要 */}
          <label className="flex flex-col gap-[8px]">
            <span className="flex items-center justify-between gap-[10px]">
              <span className="font-cn text-[12px] font-medium text-[var(--color-ink-3)]">
                {copy.labelExcerpt}
              </span>
              <span className="font-latin text-[10.5px] text-[var(--admin-placeholder)]">
                {form.excerpt.length} / {copy.excerptMax}
              </span>
            </span>
            <textarea
              value={form.excerpt}
              onChange={(e) => setField('excerpt', e.target.value.slice(0, copy.excerptMax))}
              rows={2}
              placeholder="一两句话说明这篇讲了什么，会出现在列表页与搜索结果里"
              aria-label={copy.labelExcerpt}
              className="w-full resize-none rounded-[12px] border border-[var(--color-line)] bg-[var(--admin-surface)] px-[16px] py-[13px] font-cn text-[13.5px] leading-[1.7] text-[var(--color-ink-2)] outline-none transition-colors placeholder:text-[var(--admin-placeholder)] focus:border-[var(--color-primary)]"
            />
          </label>

          {/* 正文 */}
          <div className="flex min-h-[380px] flex-1 flex-col gap-[8px]">
            <div className="flex items-center justify-between gap-[10px]">
              <span className="flex items-center gap-[8px]">
                <span className="font-cn text-[12px] font-medium text-[var(--color-ink-3)]">
                  {copy.labelBody}
                </span>
                <span className="rounded-[6px] bg-[var(--admin-soft-strong)] px-[8px] py-[3px] font-cn text-[10.5px] font-medium leading-none text-[#6b655f]">
                  {copy.markdownOn}
                </span>
              </span>
              <span className="flex items-center gap-[6px]" role="tablist" aria-label="正文视图">
                <TabButton active={tab === 'edit'} onClick={() => setTab('edit')}>
                  {copy.tabEdit}
                </TabButton>
                <TabButton active={tab === 'preview'} onClick={() => setTab('preview')}>
                  {copy.tabPreview}
                </TabButton>
              </span>
            </div>

            <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[12px] border border-[var(--color-line)] bg-[var(--admin-surface)]">
              <div className="flex shrink-0 items-center gap-[2px] px-[10px] py-[8px]">
                <ToolButton label={copy.toolBold} onClick={() => insert({ kind: 'wrap', token: '**', placeholder: '加粗文字' })}>
                  <BoldIcon className="h-[16px] w-[16px]" />
                </ToolButton>
                <ToolButton label={copy.toolItalic} onClick={() => insert({ kind: 'wrap', token: '*', placeholder: '斜体文字' })}>
                  <ItalicIcon className="h-[16px] w-[16px]" />
                </ToolButton>
                <ToolButton label={copy.toolHeading} onClick={() => insert({ kind: 'lines', prefix: '## ', placeholder: '小标题' })}>
                  <HeadingIcon className="h-[16px] w-[16px]" />
                </ToolButton>
                <span className="mx-[4px] h-[18px] w-px bg-[var(--color-line)]" aria-hidden="true" />
                <ToolButton label={copy.toolLink} onClick={() => insert({ kind: 'link' })}>
                  <LinkIcon className="h-[16px] w-[16px]" />
                </ToolButton>
                <ToolButton label={copy.toolQuote} onClick={() => insert({ kind: 'lines', prefix: '> ', placeholder: '引用内容' })}>
                  <QuoteIcon className="h-[16px] w-[16px]" />
                </ToolButton>
                <ToolButton label={copy.toolCode} onClick={() => insert({ kind: 'fence' })}>
                  <CodeIcon className="h-[16px] w-[16px]" />
                </ToolButton>
                <ToolButton label={copy.toolList} onClick={() => insert({ kind: 'lines', prefix: '- ', placeholder: '列表项' })}>
                  <ListIcon className="h-[16px] w-[16px]" />
                </ToolButton>
                <span className="flex-1" />
                <button
                  type="button"
                  onClick={() => void save()}
                  disabled={saving || !dirty}
                  className="inline-flex h-[28px] items-center gap-[6px] rounded-[7px] px-[10px] font-cn text-[11.5px] font-medium text-[var(--color-ink-2)] transition-colors hover:bg-[var(--admin-soft)] disabled:cursor-not-allowed disabled:text-[var(--admin-placeholder)]"
                >
                  <SaveIcon className="h-[14px] w-[14px]" />
                  {saving ? copy.saving : copy.save}
                </button>
              </div>

              <span className="h-px w-full shrink-0 bg-[var(--color-line)]" aria-hidden="true" />

              {tab === 'edit' ? (
                <textarea
                  ref={bodyRef}
                  value={form.body}
                  onChange={(e) => setField('body', e.target.value)}
                  onKeyDown={(e) => {
                    if (!(e.metaKey || e.ctrlKey)) return
                    const k = e.key.toLowerCase()
                    if (k === 's') {
                      e.preventDefault()
                      void save()
                    } else if (k === 'b') {
                      e.preventDefault()
                      insert({ kind: 'wrap', token: '**', placeholder: '加粗文字' })
                    } else if (k === 'i') {
                      e.preventDefault()
                      insert({ kind: 'wrap', token: '*', placeholder: '斜体文字' })
                    }
                  }}
                  placeholder={'用 Markdown 写正文。\n\n## 小标题\n普通段落。\n\n- 列表项'}
                  aria-label={copy.labelBody}
                  spellCheck={false}
                  className="min-h-0 flex-1 resize-none bg-transparent px-[24px] py-[20px] font-cn text-[13.5px] leading-[1.9] text-[var(--color-ink-2)] outline-none placeholder:text-[var(--admin-placeholder)]"
                />
              ) : (
                <div className="min-h-0 flex-1 overflow-y-auto px-[24px] py-[20px]">
                  {form.body.trim() ? (
                    /* 预览用的是前台同一套渲染（同一个解析器 + 同一个 MarkdownBody），
                       因此这里看到的效果就是读者会看到的效果，不存在两套排版 */
                    <article className="flex flex-col gap-[14px]">
                      <MarkdownBody source={form.body} />
                    </article>
                  ) : (
                    <div className="flex flex-col gap-[6px]">
                      <span className="font-cn text-[12.5px] text-[var(--color-ink-3)]">{copy.bodyEmpty}</span>
                      <span className="font-cn text-[11px] leading-[1.7] text-[var(--admin-placeholder)]">
                        {copy.bodyEmptyHint}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ------------------------------------------------- 右：属性面板 */}
        <aside className="flex w-[320px] shrink-0 flex-col overflow-y-auto border-l border-[var(--color-line)] bg-[var(--admin-surface)]">
          {/* 发布设置 */}
          <section className="flex flex-col gap-[14px] px-[20px] py-[18px]">
            <h2 className="font-cn text-[12.5px] font-semibold leading-none text-[var(--color-ink)]">
              {copy.sectionPublish}
            </h2>
            <MetaRow label={copy.labelStatus}>
              <PostStatusBadge status={status} labels={{ ...copy.statusLabels }} />
            </MetaRow>
            <MetaRow label={copy.publishedAt}>
              <span className="font-latin text-[12px] font-medium text-[var(--color-ink-2)]">
                {post?.publishedAtLabel || copy.notPublished}
              </span>
            </MetaRow>
            <MetaRow label={copy.author}>
              <span className="font-cn text-[12px] font-medium text-[var(--color-ink-2)]">
                {author || '—'}
              </span>
            </MetaRow>
          </section>

          <PanelDivider />

          {/* 分类 */}
          <section className="flex flex-col gap-[14px] px-[20px] py-[18px]">
            <h2 className="font-cn text-[12.5px] font-semibold leading-none text-[var(--color-ink)]">
              {copy.sectionCategory}
            </h2>
            <span className="relative">
              <select
                value={form.category}
                onChange={(e) => setField('category', e.target.value)}
                aria-label={copy.labelCategory}
                className="h-[34px] w-full cursor-pointer appearance-none rounded-[9px] border border-[var(--color-line)] bg-[var(--admin-surface)] pl-[13px] pr-[30px] font-cn text-[12.5px] font-medium text-[var(--color-ink)] outline-none transition-colors hover:border-[var(--color-primary)] focus:border-[var(--color-primary)]"
              >
                <option value="">{copy.noCategory}</option>
                {categories.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
              <ChevronDownIcon className="pointer-events-none absolute right-[11px] top-1/2 h-[13px] w-[13px] -translate-y-1/2 text-[var(--color-ink-3)]" />
            </span>
          </section>

          <PanelDivider />

          {/* 标签 */}
          <section className="flex flex-col gap-[14px] px-[20px] py-[18px]">
            <h2 className="font-cn text-[12.5px] font-semibold leading-none text-[var(--color-ink)]">
              {copy.sectionTags}
            </h2>
            <div className="flex flex-wrap items-center gap-[6px]">
              {form.tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex h-[27px] items-center gap-[6px] rounded-[8px] bg-[var(--admin-soft)] px-[10px] font-cn text-[11.5px] font-medium text-[#5a544e]"
                >
                  {tag}
                  <button
                    type="button"
                    aria-label={`${copy.tagRemove}：${tag}`}
                    onClick={() => setField('tags', form.tags.filter((t) => t !== tag))}
                    className="text-[var(--admin-placeholder)] transition-colors hover:text-[#b4460c]"
                  >
                    ×
                  </button>
                </span>
              ))}

              {tagOpen ? (
                <>
                  <input
                    autoFocus
                    list="admin-post-tags"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        addTag()
                      } else if (e.key === 'Escape') {
                        setTagOpen(false)
                        setTagInput('')
                      }
                    }}
                    onBlur={addTag}
                    placeholder={copy.tagPlaceholder}
                    aria-label={copy.tagAdd}
                    className="h-[27px] w-[130px] rounded-[8px] border border-[var(--color-line)] bg-[var(--admin-surface)] px-[9px] font-cn text-[11.5px] text-[var(--color-ink)] outline-none focus:border-[var(--color-primary)] placeholder:text-[var(--admin-placeholder)]"
                  />
                  <datalist id="admin-post-tags">
                    {allTags
                      .filter((t) => !form.tags.includes(t))
                      .map((t) => (
                        <option key={t} value={t} />
                      ))}
                  </datalist>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setTagOpen(true)}
                  className="inline-flex h-[27px] items-center gap-[5px] rounded-[8px] px-[10px] font-cn text-[11.5px] font-medium text-[var(--color-ink-3)] transition-colors hover:bg-[var(--admin-soft)] hover:text-[var(--color-primary)]"
                >
                  + {copy.tagAdd}
                </button>
              )}
            </div>
          </section>

          <PanelDivider />

          {/* 封面图 */}
          <section className="flex flex-col gap-[14px] px-[20px] py-[18px]">
            <div className="flex items-baseline justify-between gap-[10px]">
              <h2 className="font-cn text-[12.5px] font-semibold leading-none text-[var(--color-ink)]">
                {copy.sectionCover}
              </h2>
              <span className="font-latin text-[10.5px] text-[var(--admin-placeholder)]">1200 × 630</span>
            </div>

            <div className="flex h-[150px] w-full items-center justify-center overflow-hidden rounded-[10px] border border-[var(--color-line)] bg-[var(--admin-soft)]">
              {form.coverImage ? (
                <img src={form.coverImage} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="font-cn text-[11.5px] text-[var(--admin-placeholder)]">{copy.coverEmpty}</span>
              )}
            </div>

            <div className="flex items-center gap-[8px]">
              <input
                value={coverDraft}
                onChange={(e) => setCoverDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter') return
                  e.preventDefault()
                  if (coverDraft.trim()) setField('coverImage', coverDraft.trim())
                }}
                placeholder={copy.coverPlaceholder}
                aria-label={copy.sectionCover}
                className="h-[32px] min-w-0 flex-1 rounded-[9px] border border-[var(--color-line)] bg-[var(--admin-surface)] px-[10px] font-latin text-[11.5px] text-[var(--color-ink)] outline-none focus:border-[var(--color-primary)] placeholder:text-[var(--admin-placeholder)]"
              />
              <Button size="sm" variant="outline" onClick={() => coverDraft.trim() && setField('coverImage', coverDraft.trim())}>
                应用
              </Button>
              {form.coverImage ? (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setField('coverImage', '')
                    setCoverDraft('')
                  }}
                >
                  {copy.coverRemove}
                </Button>
              ) : null}
            </div>

            <p className="font-cn text-[10.5px] leading-[1.7] text-[var(--admin-placeholder)]">{copy.coverHint}</p>
          </section>

          <PanelDivider />

          {/* SEO 描述 */}
          <section className="flex flex-col gap-[12px] px-[20px] py-[18px]">
            <div className="flex items-baseline justify-between gap-[10px]">
              <h2 className="font-cn text-[12.5px] font-semibold leading-none text-[var(--color-ink)]">
                {copy.sectionSeo}
              </h2>
              <span className="font-latin text-[10.5px] text-[var(--admin-placeholder)]">
                {form.seoDescription.length} / {copy.seoMax}
              </span>
            </div>
            <textarea
              value={form.seoDescription}
              onChange={(e) => setField('seoDescription', e.target.value.slice(0, copy.seoMax))}
              rows={3}
              placeholder="搜索结果里显示的那段描述；留空则退回摘要"
              aria-label={copy.sectionSeo}
              className="w-full resize-none rounded-[9px] border border-[var(--color-line)] bg-[var(--admin-surface)] px-[14px] py-[12px] font-cn text-[12px] leading-[1.7] text-[var(--color-ink-2)] outline-none transition-colors placeholder:text-[var(--admin-placeholder)] focus:border-[var(--color-primary)]"
            />
          </section>
        </aside>
      </div>

      <ConfirmDialog
        open={pendingTrash}
        title={copy.trash}
        message={copy.confirmTrash}
        confirmLabel={copy.trash}
        busy={saving}
        onCancel={() => setPendingTrash(false)}
        onConfirm={() => {
          setPendingTrash(false)
          void handlePrimary()
        }}
      />

      <ConfirmDialog
        open={pendingRemove}
        title={copy.remove}
        tone="danger"
        message={copy.confirmRemove.replace('{title}', form.title || '（未命名）')}
        confirmLabel={copy.remove}
        busy={saving}
        onCancel={() => setPendingRemove(false)}
        onConfirm={() => {
          setPendingRemove(false)
          void removeForever()
        }}
      />
    </div>
  )

  /* ----------------------------------------------------------- 局部函数 */

  function addTag() {
    const name = tagInput.trim()
    setTagOpen(false)
    setTagInput('')
    if (!name) return
    if (form.tags.includes(name)) return
    if (form.tags.length >= 12) {
      setNotice({ tone: 'error', text: copy.tagMax })
      return
    }
    setField('tags', [...form.tags, name])
  }
}

/* ------------------------------------------------------------------ 小组件 */

/** 状态流转接口只返回列表项那部分字段，用这个函数把变化的那几个键摘出来合并。 */
function pickStatus(row: { status: PostStatus; publishedAt: string | null; updatedAt: string }) {
  return { status: row.status, publishedAt: row.publishedAt, updatedAt: row.updatedAt }
}

/** ISO → 'HH:mm'。只用于顶栏那句「已保存 · 18:42」。 */
function clockOf(iso: string) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={[
        'inline-flex h-[24px] items-center rounded-[7px] px-[10px] font-cn text-[11.5px] leading-none transition-colors',
        active
          ? 'bg-[var(--admin-soft-strong)] font-semibold text-[var(--color-ink)]'
          : 'text-[var(--color-ink-3)] hover:text-[var(--color-ink-2)]',
      ].join(' ')}
    >
      {children}
    </button>
  )
}

function ToolButton({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className="inline-flex h-[28px] w-[28px] shrink-0 items-center justify-center rounded-[7px] text-[#6b655f] transition-colors hover:bg-[var(--admin-soft-strong)] hover:text-[var(--color-ink)]"
    >
      {children}
    </button>
  )
}

function MetaRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-[10px]">
      <span className="font-cn text-[12px] text-[var(--color-ink-3)]">{label}</span>
      {children}
    </div>
  )
}

const PanelDivider = () => <span className="h-px w-full bg-[var(--color-line-soft)]" aria-hidden="true" />
