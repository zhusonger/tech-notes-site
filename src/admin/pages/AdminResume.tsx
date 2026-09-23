/**
 * 简历。
 *
 * 画布 `13:912`：左侧一张表单卡（顶部四个模块页签：概要 / 工作经历 / 技能与教育 /
 * 联系方式），右侧 340px 的「模块结构」面板（可拖动排序的模块清单 + 填写完成度 +
 * 一句提示）。
 *
 * 三处**对画布的刻意偏离**必须写在这里，否则下一个人只会看到「和稿子不一样」：
 *
 * 1. **画布「概要」页签的字段基本没有落地。** 它画的是「姓名 / 头衔 / 一句话简介 /
 *    当前状态 / 所在城市 / 头像」加两个开关。前五项是**站点级事实**
 *    （`site_settings` → 作者资料）：简历页抬头、首页名片、文章作者卡共用同一份，
 *    在这里再开一个写入口，就会变成「站点设置改了、简历页还是旧的」。两个开关里，
 *    「显示下载简历」在前台没有对应文件（简历页刻意不提供下载入口，见 README），
 *    「显示最近更新日期」前台也没有这一行字。所以这个页签改成：只读展示那几项 +
 *    指路「站点设置」，真正可编辑的是 `resumeSummary` 自己的字段（眉标 / 页面标题 /
 *    一行定位 / 个人概述）与核心竞争力清单。
 *
 * 2. **「模块结构」列的是真实存在的五个节。** 画布列了 6 个（概要 / 工作经历 /
 *    技能与教育 / 项目经历 / 开源贡献 / 联系方式），其中「项目经历」在本站已并入
 *    工作经历之下、「开源贡献」整节已删除（见 README「内容状态」）。列一个前台并不
 *    存在的模块，只会让人以为拖它可以改变什么。清单因此取自 `shared/sections.mjs`
 *    的 `RESUME_SECTIONS` —— 同一份清单也决定前台渲染什么，不会两处说岔。
 *    画布上那颗「添加模块」按钮一并去掉：简历页的小节是固定结构，一个永远按不动、
 *    也永远不会出现的按钮就是假入口（与「不造假开关」同源）。
 *
 * 3. **顺序与显示状态是立即写入的，不进草稿。** 画布的面板里没有保存按钮，拖完就该
 *    生效。所以这两个操作各自独立提交 `resumeLayout` 区块，与表格里的草稿互不干扰
 *    —— 它们本来就是两个区块，共用一份草稿反而会让「改了顺序但没保存内容」这件事
 *    说不清。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { adminResumeCopy as copy } from '../../data/admin'
import { RESUME_SECTIONS } from '../../../shared/sections.mjs'
import {
  ApiError,
  adminApi,
  type AdminSection,
  type SectionData,
  type SettingGroup,
} from '../adminApi'
import {
  CheckIcon,
  DragHandleIcon,
  ExternalIcon,
  EyeIcon,
  EyeOffIcon,
  IdCardIcon,
  LockIcon,
} from '../AdminIcons'
import {
  AdminCard,
  Button,
  ConfirmDialog,
  Divider,
  Field,
  HeaderButton,
  Notice,
  PageHeader,
  SwitchRow,
  TabRow,
} from '../ui'
import {
  ChipsEditor,
  RecordsEditor,
  SectionHead,
  TextRow,
  asList,
  asRows,
  asText,
  formatSavedAt,
  readPath,
  setPath,
} from '../sectionForm'

/** 顺序与显示状态所在区块的键。它只服务于右侧面板，不出现在页签里。 */
const LAYOUT_KEY = 'resumeLayout'

/** 模块 id → 点它跳到哪个页签。个人概述与核心竞争力同属「概要」，教育挂在「技能与教育」下。 */
const TAB_OF_MODULE: Record<string, string> = {
  summary: 'resumeSummary',
  highlights: 'resumeSummary',
  skills: 'resumeSkills',
  experience: 'resumeExperience',
  education: 'resumeSkills',
}

/* ==================================================================== 页面 */

export default function AdminResume() {
  const [items, setItems] = useState<AdminSection[]>([])
  /** 未保存的草稿：区块键 → 待提交文档。不在草稿里的区块沿用服务端的值。 */
  const [drafts, setDrafts] = useState<Record<string, SectionData>>({})
  const [active, setActive] = useState('resumeSummary')
  /** 只读展示用的站点级资料，与区块不同源 */
  const [author, setAuthor] = useState<SettingGroup | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [panelBusy, setPanelBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [leaving, setLeaving] = useState(false)
  /** 拖拽过程中的顺序预览；松手提交成功或失败后清空 */
  const [orderOverride, setOrderOverride] = useState<string[] | null>(null)
  const dragMovedRef = useRef(false)

  const load = useCallback(async (signal?: { cancelled: boolean }) => {
    setLoading(true)
    setError('')
    try {
      const [sectionsRes, settingsRes] = await Promise.all([
        adminApi.sections('resume'),
        adminApi.settings(),
      ])
      if (signal?.cancelled) return
      const tabs = sectionsRes.items.filter((i) => !i.panelOnly)
      setItems(sectionsRes.items)
      setDrafts({})
      setOrderOverride(null)
      setActive((prev) => (tabs.some((i) => i.key === prev) ? prev : (tabs[0]?.key ?? prev)))
      setAuthor(settingsRes.groups.find((g) => g.key === 'author') ?? null)
    } catch (err) {
      if (signal?.cancelled) return
      setError(err instanceof ApiError ? err.message : copy.loadError)
    } finally {
      if (!signal?.cancelled) setLoading(false)
    }
  }, [])

  useEffect(() => {
    const signal = { cancelled: false }
    void load(signal)
    return () => {
      signal.cancelled = true
    }
  }, [load])

  const tabs = useMemo(
    () => items.filter((i) => !i.panelOnly).map((i) => ({ key: i.key, label: i.label })),
    [items]
  )

  const section = items.find((i) => i.key === active) ?? null
  /** 当前页签的编辑内容：有草稿用草稿，否则用服务端的值。 */
  const doc = section ? (drafts[section.key] ?? section.data) : null

  const isDirty = useCallback(
    (target: AdminSection) => JSON.stringify(drafts[target.key] ?? target.data) !== JSON.stringify(target.data),
    [drafts]
  )
  const dirtyKeys = useMemo(() => items.filter(isDirty).map((i) => i.key), [items, isDirty])

  useEffect(() => {
    if (dirtyKeys.length === 0) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirtyKeys])

  const setField = (path: string, value: unknown) => {
    if (!section) return
    setDrafts((prev) => ({ ...prev, [section.key]: setPath(prev[section.key] ?? section.data, path, value) }))
    setNotice('')
  }

  const save = async () => {
    if (!section || !doc) return
    setSaving(true)
    setNotice('')
    setError('')
    try {
      const res = await adminApi.saveSection(section.key, doc)
      /* 用服务端回带的值当新基线：服务端会 trim、会丢弃空条目，本地看着一样未必存下去一样 */
      setItems((prev) =>
        prev.map((i) => (i.key === res.key ? { ...i, data: res.data, updatedAt: res.updatedAt } : i))
      )
      setDrafts((prev) => {
        const next = { ...prev }
        delete next[res.key]
        return next
      })
      setNotice(
        res.changed
          ? copy.saved.replace('{label}', section.label).replace('{n}', String(res.fields.length))
          : copy.noChange
      )
    } catch (err) {
      setError(err instanceof ApiError ? err.message : copy.saveError)
    } finally {
      setSaving(false)
    }
  }

  const discardActive = () => {
    if (!section) return
    setDrafts((prev) => {
      const next = { ...prev }
      delete next[section.key]
      return next
    })
    setNotice(copy.reverted)
  }

  /* -------------------------------------------------------------- 模块结构 */

  const layoutSection = items.find((i) => i.key === LAYOUT_KEY) ?? null
  const layoutData = layoutSection?.data ?? {}
  const hiddenIds = asList(layoutData.hidden).map(asText)
  /*
   * 顺序以库里的为准，缺失的部分按 `RESUME_SECTIONS` 补在后面。
   * 服务端下发时也会补齐（见 shared/derive.mjs），这里再兜一次是为了面板本身：
   * 少一项就会有一个模块在面板里看不见，而它其实还在前台显示着。
   */
  const storedOrder = asList(layoutData.order).map(asText).filter((id) => id)
  const order = orderOverride ?? [
    ...storedOrder,
    ...RESUME_SECTIONS.map((s) => s.id).filter((id) => !storedOrder.includes(id)),
  ]

  const docOf = useCallback(
    (key: string) => drafts[key] ?? items.find((i) => i.key === key)?.data ?? {},
    [drafts, items]
  )

  const authorValue = useCallback(
    (key: string) => asText(author?.fields.find((f) => f.key === key)?.value),
    [author]
  )
  const authorLabel = useCallback(
    (key: string) => author?.fields.find((f) => f.key === key)?.label ?? key,
    [author]
  )

  /** 每个模块的「有没有内容」与角标，都按当前草稿实时算 —— 一边填一边看着它变。 */
  const moduleState = useMemo(() => {
    const summary = docOf('resumeSummary')
    const skills = docOf('resumeSkills')
    const experience = docOf('resumeExperience')
    const filledOf: Record<string, boolean> = {
      summary: Boolean(asText(summary.description) || asText(summary.summary)),
      highlights: asList(summary.highlights).map(asText).some(Boolean),
      skills: asRows(skills.rows).length > 0,
      experience: asRows(experience.jobs).length > 0,
      education: Boolean(authorValue('educationSchool')),
    }
    const badges: Record<string, string> = {
      summary: filledOf.summary ? copy.moduleBadge.filled : copy.moduleBadge.empty,
      highlights: copy.moduleBadge.items.replace('{n}', String(asList(summary.highlights).map(asText).filter(Boolean).length)),
      skills: copy.moduleBadge.items.replace('{n}', String(asRows(skills.rows).length)),
      experience: copy.moduleBadge.items.replace('{n}', String(asRows(experience.jobs).length)),
      education: copy.moduleBadge.fromSettings,
    }
    const doneCount = RESUME_SECTIONS.filter((s) => filledOf[s.id]).length
    return { filledOf, badges, percent: Math.round((doneCount / RESUME_SECTIONS.length) * 100) }
  }, [docOf, authorValue])

  /**
   * 提交新的模块顺序。
   *
   * 失败时不做本地「反向算回去」：基线的顺序本来就没动过，清掉预览即可 ——
   * 这样回滚的结果一定与库一致，而不是自己算出来的第三种顺序。
   */
  const commitOrder = async (next: string[]) => {
    setPanelBusy(true)
    setError('')
    try {
      const res = await adminApi.saveSection(LAYOUT_KEY, { order: next, hidden: hiddenIds })
      setItems((prev) =>
        prev.map((i) => (i.key === res.key ? { ...i, data: res.data, updatedAt: res.updatedAt } : i))
      )
      setNotice(copy.orderSaved)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : copy.orderError)
    } finally {
      setOrderOverride(null)
      setPanelBusy(false)
    }
  }

  const toggleHidden = async (id: string) => {
    const next = hiddenIds.includes(id) ? hiddenIds.filter((x) => x !== id) : [...hiddenIds, id]
    const label = RESUME_SECTIONS.find((s) => s.id === id)?.label ?? id
    setPanelBusy(true)
    setError('')
    try {
      const res = await adminApi.saveSection(LAYOUT_KEY, { order, hidden: next })
      setItems((prev) =>
        prev.map((i) => (i.key === res.key ? { ...i, data: res.data, updatedAt: res.updatedAt } : i))
      )
      setNotice(
        (hiddenIds.includes(id) ? copy.hiddenOff : copy.hiddenOn).replace('{label}', label)
      )
    } catch (err) {
      setError(err instanceof ApiError ? err.message : copy.visibilityError)
    } finally {
      setPanelBusy(false)
    }
  }

  const beginDrag = (e: React.PointerEvent, id: string) => {
    if (!layoutSection || panelBusy || order.length < 2) return
    e.preventDefault()

    let working = order.slice()
    dragMovedRef.current = false
    setOrderOverride(working)

    const idAt = (x: number, y: number): string | null =>
      (document.elementFromPoint(x, y) as HTMLElement | null)
        ?.closest('[data-module-id]')
        ?.getAttribute('data-module-id') ?? null

    const onMove = (ev: PointerEvent) => {
      const overId = idAt(ev.clientX, ev.clientY)
      if (!overId || overId === id) return
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

    /* 拖拽中禁掉文本选中：否则掠过行内文字会留下一片蓝色选区，
       看起来像「选中了这些模块」，而实际发生的是一次排序。 */
    document.body.style.userSelect = 'none'
    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
    document.addEventListener('pointercancel', onUp)
  }

  return (
    <div className="flex min-h-full flex-col gap-[18px]">
      <PageHeader
        title={copy.title}
        subtitle={copy.subtitle}
        right={
          <HeaderButton
            icon={<ExternalIcon className="h-[14px] w-[14px]" />}
            onClick={() => window.open('/resume', '_blank', 'noopener,noreferrer')}
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
      {notice ? (
        <Notice tone="success" onClose={() => setNotice('')}>
          {notice}
        </Notice>
      ) : null}
      {dirtyKeys.length > 0 && !notice ? (
        <Notice tone="warn">
          {copy.unsaved.replace('{n}', String(dirtyKeys.length))}
          <button type="button" onClick={() => setLeaving(true)} className="ml-[8px] underline">
            {copy.discardAll}
          </button>
        </Notice>
      ) : null}

      <div className="flex flex-1 items-start gap-[20px]">
        {/* -------------------------------------------------- 左：表单卡 */}
        <AdminCard className="flex min-h-[560px] flex-1 flex-col">
          <div className="px-[18px] py-[14px]">
            <TabRow items={tabs} active={active} onChange={setActive} label="简历模块" />
          </div>
          <Divider />

          {loading && !section ? (
            <div className="flex flex-1 items-center justify-center px-[22px] py-[40px] font-cn text-[12.5px] text-[var(--color-ink-3)]">
              正在加载…
            </div>
          ) : section && doc ? (
            <>
              <div className="flex flex-1 flex-col gap-[18px] px-[22px] py-[22px]">
                <SectionHead title={section.title} desc={section.desc} />

                {section.key === 'resumeSummary' ? (
                  <>
                    <TextRow
                      label={copy.field.eyebrow}
                      value={asText(doc.eyebrow)}
                      max={section.fields.eyebrow?.max}
                      onChange={(v) => setField('eyebrow', v)}
                    />
                    <TextRow
                      label={copy.field.pageTitle}
                      value={asText(doc.title)}
                      max={section.fields.title?.max}
                      onChange={(v) => setField('title', v)}
                    />
                    <TextRow
                      label={copy.field.position}
                      value={asText(doc.description)}
                      max={section.fields.description?.max}
                      onChange={(v) => setField('description', v)}
                    />
                    <TextRow
                      label={copy.field.summary}
                      hint={copy.field.summaryHint}
                      value={asText(doc.summary)}
                      max={section.fields.summary?.max}
                      rows={6}
                      onChange={(v) => setField('summary', v)}
                    />
                    <ChipsEditor
                      rule={section.lists.highlights}
                      items={asList(doc.highlights).map(asText)}
                      onChange={(next) => setField('highlights', next)}
                    />
                    <ReadOnlyFacts
                      title={copy.readonly.title}
                      desc={copy.readonly.desc}
                      rows={['author', 'role', 'location', 'email', 'github'].map((key) => ({
                        label: authorLabel(key),
                        value: authorValue(key),
                      }))}
                      avatar={authorValue('avatar')}
                      avatarLabel={copy.readonly.avatar}
                    />
                  </>
                ) : null}

                {section.key === 'resumeExperience' ? (
                  <RecordsEditor
                    rule={section.lists.jobs}
                    rows={asRows(doc.jobs)}
                    onChange={(next) => setField('jobs', next)}
                  />
                ) : null}

                {section.key === 'resumeSkills' ? (
                  <>
                    <RecordsEditor
                      rule={section.lists.rows}
                      rows={asRows(doc.rows)}
                      onChange={(next) => setField('rows', next)}
                    />
                    <ReadOnlyFacts
                      title={copy.education.title}
                      desc={copy.education.desc}
                      rows={[
                        { label: authorLabel('educationSchool'), value: authorValue('educationSchool') },
                        { label: authorLabel('educationMajor'), value: authorValue('educationMajor') },
                        { label: authorLabel('educationDate'), value: authorValue('educationDate') },
                        { label: authorLabel('educationCert'), value: authorValue('educationCert') },
                      ]}
                    />
                  </>
                ) : null}

                {section.key === 'resumeContact' ? (
                  <>
                    {Object.keys(section.fields).map((key) => (
                      <SwitchRow
                        key={key}
                        checked={readPath(doc, key) === true}
                        label={section.labels[key] ?? key}
                        onChange={(next) => setField(key, next)}
                      />
                    ))}
                    <ReadOnlyFacts
                      title={copy.contact.title}
                      desc={copy.contact.desc}
                      rows={[
                        { label: authorLabel('email'), value: authorValue('email') },
                        { label: authorLabel('location'), value: authorValue('location') },
                        { label: authorLabel('github'), value: authorValue('github') },
                      ]}
                    />
                  </>
                ) : null}
              </div>

              <Divider />
              <div className="flex flex-wrap items-center justify-between gap-[12px] px-[22px] py-[16px]">
                <span className="font-cn text-[11px] text-[var(--color-ink-3)]">
                  {copy.savedAt.replace('{time}', formatSavedAt(section.updatedAt, copy.neverSaved))}
                </span>
                <div className="flex items-center gap-[10px]">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!isDirty(section) || saving}
                    onClick={discardActive}
                  >
                    {copy.cancel}
                  </Button>
                  <Button size="sm" loading={saving} disabled={!isDirty(section)} onClick={() => void save()}>
                    {copy.save}
                  </Button>
                </div>
              </div>
            </>
          ) : null}
        </AdminCard>

        {/* -------------------------------------------------- 右：模块结构 */}
        <ModulePanel
          order={order}
          hiddenIds={hiddenIds}
          badges={moduleState.badges}
          filled={moduleState.filledOf}
          percent={moduleState.percent}
          loading={loading}
          ready={Boolean(layoutSection)}
          busy={panelBusy}
          dragging={Boolean(orderOverride) && dragMovedRef.current}
          activeTab={active}
          onDragStart={beginDrag}
          onToggle={(id) => void toggleHidden(id)}
          onPick={(id) => setActive(TAB_OF_MODULE[id] ?? active)}
        />
      </div>

      <ConfirmDialog
        open={leaving}
        title={copy.discardAllTitle}
        tone="danger"
        confirmLabel={copy.discardAll}
        cancelLabel={copy.continueEdit}
        message={copy.discardAllMessage.replace('{n}', String(dirtyKeys.length))}
        onCancel={() => setLeaving(false)}
        onConfirm={() => {
          setDrafts({})
          setLeaving(false)
          setNotice(copy.reverted)
        }}
      />
    </div>
  )
}

/* -------------------------------------------------------------- 只读事实块 */

/**
 * 只读展示一组来自别处的值。
 *
 * 这里的「只读」不是偷懒：那几项在库里属于 `site_settings`，与首页名片、文章作者卡
 * 共用一份。开第二个写入口最坏的结果是「两边都以为自己是权威」，最后点保存的那个赢，
 * 而改的人根本不知道发生过覆盖。所以只展示 + 指路。
 */
function ReadOnlyFacts({
  title,
  desc,
  rows,
  avatar = '',
  avatarLabel = '',
}: {
  title: string
  desc: string
  rows: { label: string; value: string }[]
  avatar?: string
  avatarLabel?: string
}) {
  return (
    <div className="flex flex-col gap-[14px] rounded-[12px] border border-[var(--admin-soft-strong)] bg-[var(--admin-readonly)] px-[16px] py-[16px]">
      <div className="flex flex-col gap-[4px]">
        <div className="flex items-center gap-[8px]">
          <IdCardIcon className="h-[14px] w-[14px] text-[var(--color-ink-3)]" />
          <h3 className="font-cn text-[12.5px] font-semibold leading-none text-[var(--color-ink)]">
            {title}
          </h3>
          <span className="inline-flex h-[20px] items-center gap-[4px] rounded-full bg-[var(--admin-soft-strong)] px-[9px] font-cn text-[10.5px] text-[var(--color-ink-3)]">
            <LockIcon className="h-[11px] w-[11px]" />
            {copy.readonly.badge}
          </span>
        </div>
        <p className="font-cn text-[11px] leading-[1.65] text-[var(--color-ink-3)]">{desc}</p>
      </div>

      <div className="flex flex-col gap-[12px]">
        {rows.map((row) => (
          <Field key={row.label} label={row.label}>
            <span className="flex min-h-[38px] items-center rounded-[10px] border border-[var(--admin-soft-strong)] bg-[var(--admin-surface)] px-[13px] font-cn text-[12.5px] leading-[1.7] text-[var(--color-ink-2)]">
              {row.value || '—'}
            </span>
          </Field>
        ))}

        {avatar ? (
          <Field label={avatarLabel}>
            <span className="flex items-center gap-[12px]">
              <img
                src={avatar}
                alt="当前头像"
                className="h-[44px] w-[44px] rounded-[12px] border border-[var(--color-line)] object-cover"
              />
              <span className="font-latin text-[11px] text-[var(--color-ink-3)]">{avatar}</span>
            </span>
          </Field>
        ) : null}
      </div>

      <a
        href="/admin/settings"
        className="inline-flex h-[32px] w-fit items-center gap-[7px] rounded-full border border-[var(--color-line)] bg-[var(--admin-surface)] px-[14px] font-cn text-[12px] font-medium text-[var(--color-ink-2)] transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
      >
        <ExternalIcon className="h-[13px] w-[13px]" />
        {copy.readonly.goSettings}
      </a>
    </div>
  )
}

/* -------------------------------------------------------------- 模块结构面板 */

function ModulePanel({
  order,
  hiddenIds,
  badges,
  filled,
  percent,
  loading,
  ready,
  busy,
  dragging,
  activeTab,
  onDragStart,
  onToggle,
  onPick,
}: {
  order: string[]
  hiddenIds: string[]
  badges: Record<string, string>
  filled: Record<string, boolean>
  percent: number
  /** 还在取数据。此时既不是「顺序为空」也不是「读取失败」，不能拿这两种文案去顶 */
  loading: boolean
  /** 数据回来了，但库里没有 `resumeLayout` 这一块 —— 那才是真的读不到 */
  ready: boolean
  busy: boolean
  dragging: boolean
  /**
   * 当前正在编辑的页签。
   * 底色只用来标「正在编辑的这一节」（与画布一致：列表里带底色的行即焦点），
   * 已隐藏是状态而不是焦点，改用文字降级 + 「已隐藏」徽标 + 虚线圈表示。
   *
   * 一个页签可能管两节（「概要」管个人概述与核心竞争力，「技能与教育」管技能与教育），
   * 这时两行都带底色 —— 它们确实都被这一屏在编辑，不做「只挑一行」的额外状态。
   * 「联系方式」不落在任何模块上，所以它没有对应的高亮行。
   */
  activeTab: string
  onDragStart: (e: React.PointerEvent, id: string) => void
  onToggle: (id: string) => void
  onPick: (id: string) => void
}) {
  const labelOf = (id: string) => RESUME_SECTIONS.find((s) => s.id === id)?.label ?? id
  const visibleCount = order.filter((id) => !hiddenIds.includes(id)).length
  const pending = RESUME_SECTIONS.filter((s) => !filled[s.id])

  return (
    <AdminCard className="flex w-[340px] shrink-0 flex-col">
      <header className="flex items-start justify-between gap-[12px] px-[18px] py-[15px]">
        <div className="flex flex-col gap-[3px]">
          <h2 className="font-cn text-[12.5px] font-semibold leading-none text-[var(--color-ink)]">
            {copy.panel.title}
          </h2>
          <p className="font-cn text-[10.5px] leading-[1.5] text-[var(--color-ink-3)]">
            {copy.panel.desc}
          </p>
        </div>
        <span className="shrink-0 text-right font-cn text-[10.5px] leading-[1.5] text-[var(--color-ink-3)]">
          {copy.panel.count.replace('{n}', String(order.length))}
          {hiddenIds.length > 0 ? (
            <>
              <br />
              {copy.panel.countHidden.replace('{h}', String(hiddenIds.length))}
            </>
          ) : null}
        </span>
      </header>
      <Divider />

      <div className="flex flex-1 flex-col gap-[10px] px-[14px] py-[16px]">
        {loading ? (
          <span className="font-cn text-[11.5px] text-[var(--color-ink-3)]">正在加载…</span>
        ) : !ready ? (
          <Notice tone="warn">{copy.layoutMissing}</Notice>
        ) : (
          <div className="flex flex-col gap-[6px]">
            {order.map((id) => {
              const off = hiddenIds.includes(id)
              const current = TAB_OF_MODULE[id] === activeTab
              return (
                <div
                  key={id}
                  data-module-id={id}
                  aria-current={current ? 'true' : undefined}
                  onClick={() => {
                    if (dragging) return
                    onPick(id)
                  }}
                  className={[
                    'flex items-center gap-[10px] rounded-[10px] px-[10px] py-[9px] transition-colors',
                    current
                      ? 'bg-[var(--color-primary-soft)]'
                      : off
                        ? 'bg-transparent outline outline-1 -outline-offset-1 outline-dashed outline-[var(--admin-soft-strong)]'
                        : 'bg-transparent',
                  ].join(' ')}
                >
                  <button
                    type="button"
                    onPointerDown={(e) => onDragStart(e, id)}
                    disabled={busy}
                    aria-label={`${copy.panel.dragHandle}：${labelOf(id)}`}
                    title={copy.panel.dragHandle}
                    className="-ml-[2px] flex h-[16px] w-[16px] shrink-0 cursor-grab items-center justify-center text-[var(--color-ink-3)] disabled:cursor-not-allowed disabled:opacity-40 active:cursor-grabbing"
                  >
                    <DragHandleIcon className="h-[13px] w-[13px]" />
                  </button>
                  <span
                    className={[
                      'min-w-0 flex-1 truncate font-cn text-[12.5px]',
                      off ? 'text-[var(--color-ink-3)]' : 'font-medium text-[var(--color-ink)]',
                    ].join(' ')}
                  >
                    {labelOf(id)}
                  </span>
                  <span
                    className={[
                      'shrink-0 font-cn text-[10.5px]',
                      filled[id] && !off ? 'text-[var(--color-primary)]' : 'text-[var(--color-ink-3)]',
                    ].join(' ')}
                  >
                    {off ? copy.panel.hiddenBadge : (badges[id] ?? '')}
                  </span>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={(e) => {
                      e.stopPropagation()
                      onToggle(id)
                    }}
                    aria-label={`${off ? copy.panel.show : copy.panel.hide}：${labelOf(id)}`}
                    title={off ? copy.panel.show : copy.panel.hide}
                    className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[7px] text-[var(--color-ink-3)] transition-colors hover:bg-[var(--admin-surface)] hover:text-[var(--color-ink)] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {off ? <EyeOffIcon className="h-[13px] w-[13px]" /> : <EyeIcon className="h-[13px] w-[13px]" />}
                  </button>
                </div>
              )
            })}
          </div>
        )}

        {loading || !ready ? null : (
        <div className="flex flex-col gap-[11px] rounded-[12px] bg-[var(--admin-soft)] px-[14px] py-[14px]">
          <div className="flex items-baseline justify-between gap-[8px]">
            <span className="font-cn text-[11.5px] font-medium text-[var(--color-ink-2)]">
              {copy.panel.progressTitle}
            </span>
            <span className="font-latin text-[11.5px] font-semibold text-[var(--color-primary)]">
              {percent}%
            </span>
          </div>
          <div className="h-[6px] overflow-hidden rounded-full bg-[var(--admin-soft-strong)]">
            <span
              className="block h-full rounded-full bg-[var(--color-primary)] transition-[width]"
              style={{ width: `${percent}%` }}
            />
          </div>
          <div className="flex flex-col gap-[7px]">
            {pending.length === 0 ? (
              <ProgressItem done text={copy.panel.allDone} />
            ) : (
              <>
                {RESUME_SECTIONS.filter((s) => filled[s.id]).map((s) => (
                  <ProgressItem key={s.id} done text={s.label} />
                ))}
                {pending.map((s) => (
                  <ProgressItem key={s.id} text={copy.panel.pending.replace('{label}', s.label)} />
                ))}
              </>
            )}
          </div>
          <p className="font-cn text-[10.5px] leading-[1.6] text-[var(--color-ink-3)]">
            {copy.panel.progressHint}
          </p>
        </div>
        )}

        {ready && !loading && visibleCount === 0 ? (
          <Notice tone="warn">{copy.panel.allHidden}</Notice>
        ) : null}

        <div className="rounded-[12px] bg-[var(--admin-soft)] px-[14px] py-[13px]">
          <p className="font-cn text-[10.5px] leading-[1.7] text-[var(--color-ink-3)]">{copy.panel.tip}</p>
        </div>
      </div>
    </AdminCard>
  )
}

function ProgressItem({ done = false, text }: { done?: boolean; text: string }) {
  return (
    <div className="flex items-center gap-[7px]">
      <span
        className={[
          'flex h-[11px] w-[11px] shrink-0 items-center justify-center rounded-full',
          done ? 'bg-[color-mix(in_srgb,var(--color-primary)_14%,transparent)]' : 'bg-[var(--admin-soft-strong)]',
        ].join(' ')}
      >
        <CheckIcon
          className={[
            'h-[8px] w-[8px]',
            done ? 'text-[var(--color-primary)]' : 'text-[var(--admin-placeholder)]',
          ].join(' ')}
        />
      </span>
      <span className="min-w-0 flex-1 truncate font-cn text-[10.5px] leading-[1.5] text-[var(--color-ink-3)]">
        {text}
      </span>
    </div>
  )
}
