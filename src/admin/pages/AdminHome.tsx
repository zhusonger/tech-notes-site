/**
 * 首页内容。
 *
 * 画布 `13:781`：左侧一张表单卡（顶部横向模块页签，卡内一列字段），
 * 右侧 380px 的**实时预览**卡 —— 浏览器框里按前台的排版层级缩小渲染，
 * 底部一行「上次保存 · N 分钟前 / 已同步」。
 *
 * 三个设计决定记在这里：
 *
 * 1. **字段上限不在这里写。** 每次字数计数（主标题 16 / 60）的上限由服务端随区块
 *    下发，源头是 `shared/sections.mjs`。界面另写一份，就会出现「界面上还能敲、
 *    保存却被拒」——两边都对，只是说的不是同一件事。
 *
 * 2. **主标题是一个两列复合字段，不是画布上那个单输入框。** 画布把它画成一格
 *    装着「示例作者 · Tech Notes」；但前台要把中间那个分隔点染成主色，库里中文名与
 *    拉丁名是分两段存的（`HeroSection.name` / `.latin`）。为了「照画布所以合成一个
 *    输入框」而拆掉前台的分色渲染，是拿真实能力换纸面一致。标签与计数仍按画布口径
 *    （合起来算 60）。
 *
 * 3. **「页脚」页签只读。** 页脚文案在库里属于 `site_settings`，已经在
 *    「站点设置 → 基础信息」里可编辑；这里再开一个写入口就是两份真相。
 *    页签保留（它属于画布的信息架构），但只做预览 + 指路。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { adminHomeCopy as copy } from '../../data/admin'
import {
  ApiError,
  adminApi,
  type AdminSection,
  type SectionData,
  type SettingGroup,
} from '../adminApi'
import { ExternalIcon, LockIcon } from '../AdminIcons'
import {
  AdminCard,
  Button,
  ConfirmDialog,
  Divider,
  Field,
  HeaderButton,
  Notice,
  PageHeader,
  Switch,
  TabRow,
} from '../ui'
import {
  ChipsEditor,
  ColumnRow,
  Counter,
  RecordsEditor,
  SectionHead,
  SubInput,
  TextRow,
  asBool,
  asList,
  asRows,
  asText,
  formatSavedAt,
  readPath,
  setPath,
} from '../sectionForm'

/** 页脚页签的键。它不是区块，是 `site_settings` 的只读视图。 */
const FOOTER_TAB = 'footer'


/** `https://notes.example.com/x` → `notes.example.com`；没配域名时返回空串。 */
function hostOf(url: string): string {
  const trimmed = url.trim()
  if (!trimmed) return ''
  try {
    return new URL(trimmed).host
  } catch {
    return trimmed.replace(/^\/+/, '').replace(/\/+$/, '')
  }
}

/* ==================================================================== 页面 */

export default function AdminHome() {
  const [items, setItems] = useState<AdminSection[]>([])
  /** 未保存的草稿：区块键 → 待提交文档。不在草稿里的区块沿用服务端的值。 */
  const [drafts, setDrafts] = useState<Record<string, SectionData>>({})
  const [active, setActive] = useState('hero')
  /** 页脚的只读文案来自站点设置，与区块不同源 */
  const [footer, setFooter] = useState<SettingGroup | null>(null)
  const [host, setHost] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [leaving, setLeaving] = useState(false)

  const load = useCallback(async (signal?: { cancelled: boolean }) => {
    setLoading(true)
    setError('')
    try {
      const [sectionsRes, settingsRes] = await Promise.all([adminApi.sections('home'), adminApi.settings()])
      if (signal?.cancelled) return
      setItems(sectionsRes.items)
      setDrafts({})
      setActive((prev) =>
        prev === FOOTER_TAB || sectionsRes.items.some((i) => i.key === prev)
          ? prev
          : (sectionsRes.items[0]?.key ?? 'hero')
      )
      setFooter(settingsRes.groups.find((g) => g.key === 'basic') ?? null)
      const siteUrl = (settingsRes.groups.find((g) => g.key === 'domain')?.fields ?? []).find(
        (f) => f.key === 'siteUrl'
      )
      setHost(typeof siteUrl?.value === 'string' ? hostOf(siteUrl.value) : '')
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
      /*
       * 用服务端回带的值当新基线，而不是把本地草稿当「已保存」：
       * 服务端会 trim、会丢弃空标签，本地看着一模一样、存下去未必一样。
       */
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

  const tabs = useMemo(
    () => [...items.map((i) => ({ key: i.key, label: i.label })), { key: FOOTER_TAB, label: '页脚' }],
    [items]
  )

  return (
    <div className="flex min-h-full flex-col gap-[18px]">
      <PageHeader
        title={copy.title}
        subtitle={copy.subtitle}
        right={
          <HeaderButton
            icon={<ExternalIcon className="h-[14px] w-[14px]" />}
            onClick={() => window.open('/', '_blank', 'noopener,noreferrer')}
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
            <TabRow items={tabs} active={active} onChange={setActive} label="首页模块" />
          </div>
          <Divider />

          {loading && !section ? (
            <div className="flex flex-1 items-center justify-center px-[22px] py-[40px] font-cn text-[12.5px] text-[var(--color-ink-3)]">
              正在加载…
            </div>
          ) : active === FOOTER_TAB ? (
            <FooterPanel footer={footer} />
          ) : section && doc ? (
            <>
              <div className="flex flex-1 flex-col gap-[18px] px-[22px] py-[22px]">
                <SectionHead title={section.title} desc={section.desc} />
                {section.key === 'hero' ? <HeroFields section={section} doc={doc} onChange={setField} /> : null}
                {section.key === 'about' ? <AboutFields section={section} doc={doc} onChange={setField} /> : null}
                {section.key === 'stack' ? <StackFields section={section} doc={doc} onChange={setField} /> : null}
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

        {/* -------------------------------------------------- 右：实时预览 */}
        <PreviewCard
          active={active}
          label={section?.label ?? ''}
          doc={doc}
          footer={footer}
          host={host}
          updatedAt={section?.updatedAt ?? null}
          dirty={dirtyKeys.length > 0}
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

/* ------------------------------------------------------------------ 首屏字段 */

function HeroFields({
  section,
  doc,
  onChange,
}: {
  section: AdminSection
  doc: SectionData
  onChange: (path: string, value: unknown) => void
}) {
  const f = copy.field
  const rule = (path: string) => section.fields[path] ?? {}
  /* 主标题的联合上限来自服务端（画布口径：中文名 + 「 · 」+ 拉丁名） */
  const headline = section.counters.headline
  const headlineText = headline
    ? headline.keys.map((k) => asText(readPath(doc, k))).join(headline.separator ?? '')
    : ''

  return (
    <>
      <TextRow
        label={f.eyebrow}
        value={asText(doc.eyebrow)}
        max={rule('eyebrow').max}
        onChange={(v) => onChange('eyebrow', v)}
      />

      <Field
        label={f.headline}
        hint={f.headlineHint}
        right={headline ? <Counter value={headlineText} max={headline.max} /> : undefined}
      >
        <ColumnRow>
          <SubInput
            caption={f.name}
            value={asText(doc.name)}
            max={rule('name').max}
            onChange={(v) => onChange('name', v)}
          />
          <SubInput
            caption={f.latin}
            value={asText(doc.latin)}
            max={rule('latin').max}
            onChange={(v) => onChange('latin', v)}
          />
        </ColumnRow>
      </Field>

      <TextRow
        label={f.subline}
        value={asText(doc.subline)}
        max={rule('subline').max}
        onChange={(v) => onChange('subline', v)}
      />

      <TextRow
        label={f.paragraph}
        hint={f.paragraphHint}
        value={asText(doc.paragraph)}
        max={rule('paragraph').max}
        rows={3}
        onChange={(v) => onChange('paragraph', v)}
      />

      <TextRow
        label={f.trust}
        value={asText(doc.trust)}
        max={rule('trust').max}
        onChange={(v) => onChange('trust', v)}
      />

      <Field label={f.ctas} hint={f.ctasHint}>
        <ColumnRow>
          <div className="flex min-w-0 flex-1 flex-col gap-[10px]">
            <SubInput
              caption={f.primaryLabel}
              value={asText(readPath(doc, 'primaryAction.label'))}
              max={rule('primaryAction.label').max}
              onChange={(v) => onChange('primaryAction.label', v)}
            />
            <SubInput
              caption={f.primaryTo}
              value={asText(readPath(doc, 'primaryAction.to'))}
              max={rule('primaryAction.to').max}
              onChange={(v) => onChange('primaryAction.to', v)}
            />
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-[10px]">
            <SubInput
              caption={f.secondaryLabel}
              value={asText(readPath(doc, 'secondaryAction.label'))}
              max={rule('secondaryAction.label').max}
              onChange={(v) => onChange('secondaryAction.label', v)}
            />
            <SubInput
              caption={f.secondaryTo}
              value={asText(readPath(doc, 'secondaryAction.to'))}
              max={rule('secondaryAction.to').max}
              onChange={(v) => onChange('secondaryAction.to', v)}
            />
          </div>
        </ColumnRow>
      </Field>

      <TextRow
        label={f.image}
        hint={f.imageHint}
        value={asText(doc.image)}
        max={rule('image').max}
        onChange={(v) => onChange('image', v)}
      />

      {/* 画布把两个开关放在一个浅底容器里（13:855），这里保持一致 */}
      <div className="flex flex-wrap items-center gap-[12px] rounded-[12px] bg-[var(--admin-soft)] px-[14px] py-[12px]">
        {(
          [
            ['showImage', section.labels.showImage ?? '显示首屏配图'],
            ['showTrust', section.labels.showTrust ?? '显示数据背书'],
          ] as const
        ).map(([key, label]) => (
          <div key={key} className="flex flex-1 items-center gap-[9px]">
            <Switch checked={asBool(doc[key])} onChange={(next) => onChange(key, next)} label={label} />
            <span className="font-cn text-[12.5px] text-[var(--color-ink-2)]">{label}</span>
          </div>
        ))}
      </div>
    </>
  )
}

/* ------------------------------------------------------------------ 关于我字段 */

function AboutFields({
  section,
  doc,
  onChange,
}: {
  section: AdminSection
  doc: SectionData
  onChange: (path: string, value: unknown) => void
}) {
  return (
    <>
      <ChipsEditor
        rule={section.lists.skills}
        items={asList(doc.skills).map(asText)}
        onChange={(next) => onChange('skills', next)}
      />
      <TextRow
        label={section.labels.skillsNote ?? '技能补注'}
        value={asText(doc.skillsNote)}
        max={section.fields.skillsNote?.max}
        onChange={(v) => onChange('skillsNote', v)}
      />
      <ChipsEditor
        rule={section.lists.strengths}
        items={asList(doc.strengths).map(asText)}
        onChange={(next) => onChange('strengths', next)}
      />
      <RecordsEditor
        rule={section.lists.experience}
        rows={asRows(doc.experience)}
        onChange={(next) => onChange('experience', next)}
      />
      <RecordsEditor rule={section.lists.stats} rows={asRows(doc.stats)} onChange={(next) => onChange('stats', next)} />
    </>
  )
}

/* ------------------------------------------------------------------ 技术栈字段 */

function StackFields({
  section,
  doc,
  onChange,
}: {
  section: AdminSection
  doc: SectionData
  onChange: (path: string, value: unknown) => void
}) {
  return (
    <>
      <RecordsEditor rule={section.lists.items} rows={asRows(doc.items)} onChange={(next) => onChange('items', next)} />
      <TextRow
        label={section.labels.note ?? '网格补注'}
        value={asText(doc.note)}
        max={section.fields.note?.max}
        onChange={(v) => onChange('note', v)}
      />
    </>
  )
}

/* ------------------------------------------------------------------ 页脚页签 */

/**
 * 页脚只读面板。
 *
 * 文案来自 `site_settings`（「站点设置 → 基础信息」），这里不提供输入框 ——
 * 两个写入口最坏的结果是「两边都以为自己是权威」，最后点保存的那个赢，
 * 而改的人根本不知道发生过覆盖。
 */
function FooterPanel({ footer }: { footer: SettingGroup | null }) {
  const c = copy.footer
  const value = (key: string) => {
    const field = footer?.fields.find((f) => f.key === key)
    return typeof field?.value === 'string' ? field.value : ''
  }

  return (
    <div className="flex flex-1 flex-col gap-[18px] px-[22px] py-[22px]">
      <div className="flex flex-col gap-[4px]">
        <div className="flex items-center gap-[8px]">
          <h2 className="font-cn text-[14px] font-semibold leading-none text-[var(--color-ink)]">{c.title}</h2>
          <span className="inline-flex h-[20px] items-center gap-[4px] rounded-full bg-[var(--admin-soft-strong)] px-[9px] font-cn text-[10.5px] text-[var(--color-ink-3)]">
            <LockIcon className="h-[11px] w-[11px]" />
            {c.readonly}
          </span>
        </div>
        <p className="font-cn text-[11.5px] leading-[1.65] text-[var(--color-ink-3)]">{c.desc}</p>
      </div>

      <div className="flex flex-col gap-[14px]">
        <ReadOnlyRow label={c.quote} value={value('footerQuote')} />
        <ReadOnlyRow label={c.note} value={value('footerNote')} />
        <ReadOnlyRow label={c.copyright} value={value('copyright')} />
        <ReadOnlyRow label={c.links} value={c.linksValue} />
      </div>

      <a
        href="/admin/settings"
        className="inline-flex h-[34px] w-fit items-center gap-[7px] rounded-full border border-[var(--color-line)] bg-[var(--admin-surface)] px-[15px] font-cn text-[12.5px] font-medium text-[var(--color-ink-2)] transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
      >
        <ExternalIcon className="h-[13px] w-[13px]" />
        {c.goSettings}
      </a>
    </div>
  )
}

function ReadOnlyRow({ label, value }: { label: string; value: string }) {
  return (
    <Field label={label}>
      <span className="flex min-h-[38px] items-center rounded-[10px] border border-[var(--admin-soft-strong)] bg-[var(--admin-readonly)] px-[13px] font-cn text-[12.5px] leading-[1.7] text-[var(--color-ink-2)]">
        {value || '—'}
      </span>
    </Field>
  )
}

/* ------------------------------------------------------------------ 实时预览 */

function PreviewCard({
  active,
  label,
  doc,
  footer,
  host,
  updatedAt,
  dirty,
}: {
  active: string
  label: string
  doc: SectionData | null
  footer: SettingGroup | null
  host: string
  updatedAt: string | null
  dirty: boolean
}) {
  const isFooter = active === FOOTER_TAB
  const scope = (copy.preview.scope as Record<string, string>)[active] ?? label
  /*
   * 页脚页签没有区块，它的时间要读站点设置那一组的 —— 用区块的 updatedAt
   * 会显示「尚未保存过」，而页脚文案明明早就在库里，那是句假话。
   */
  const savedAt = isFooter ? (footer?.savedAt ?? null) : updatedAt

  return (
    <div className="flex w-[380px] shrink-0 flex-col self-stretch rounded-[16px] border border-[var(--color-line)] bg-[var(--admin-surface)]">
      <div className="flex items-center justify-between gap-[10px] px-[18px] py-[15px]">
        <div className="flex flex-col gap-[2px]">
          <span className="font-cn text-[12.5px] font-medium leading-none text-[var(--color-ink)]">
            {copy.preview.title}
          </span>
          <span className="font-cn text-[10.5px] leading-none text-[var(--admin-placeholder)]">{scope}</span>
        </div>
        <span className="font-latin text-[10.5px] text-[var(--color-ink-3)]">{copy.preview.viewport}</span>
      </div>
      <Divider />

      <div className="flex flex-1 flex-col gap-[14px] px-[18px] py-[18px]">
        {/* 浏览器框：画布用一条地址栏说明「这是前台的样子」 */}
        <div className="flex flex-col overflow-hidden rounded-[12px] border border-[var(--color-line)] bg-[var(--admin-surface)]">
          <div className="flex h-[26px] items-center gap-[5px] bg-[#f6f1eb] px-[10px]">
            <span className="h-[6px] w-[6px] rounded-full bg-[#e0d6cb]" />
            <span className="h-[6px] w-[6px] rounded-full bg-[#e0d6cb]" />
            <span className="h-[6px] w-[6px] rounded-full bg-[#e0d6cb]" />
            <span className="ml-[4px] truncate font-latin text-[9px] text-[#a79e96]">{host || '前台首页'}</span>
          </div>

          {isFooter ? (
            <FooterPreview footer={footer} />
          ) : active === 'about' && doc ? (
            <AboutPreview doc={doc} />
          ) : active === 'stack' && doc ? (
            <StackPreview doc={doc} />
          ) : doc ? (
            <HeroPreview doc={doc} />
          ) : null}
        </div>

        <div className="flex items-center justify-between gap-[10px] rounded-[10px] bg-[#faf7f4] px-[14px] py-[11px]">
          <span className="font-cn text-[10.5px] text-[var(--color-ink-3)]">
            {copy.savedAt.replace('{time}', formatSavedAt(savedAt, copy.neverSaved))}
          </span>
          <span
            className={[
              'font-cn text-[10.5px] font-medium',
              dirty ? 'text-[#a8611a]' : 'text-[var(--color-ink-2)]',
            ].join(' ')}
          >
            {dirty ? copy.dirty : copy.synced}
          </span>
        </div>

        <p className="font-cn text-[10.5px] leading-[1.6] text-[var(--admin-placeholder)]">{copy.preview.hint}</p>
      </div>
    </div>
  )
}

function HeroPreview({ doc }: { doc: SectionData }) {
  const latin = asText(doc.latin)
  const showImage = asBool(doc.showImage)
  const showTrust = asBool(doc.showTrust)

  return (
    <>
      <div className="flex flex-col gap-[9px] bg-gradient-to-br from-[#faf5ee] to-white px-[16px] py-[16px]">
        <span className="flex items-center gap-[7px]">
          <span className="h-[2px] w-[12px] rounded-full bg-[var(--color-primary)]" />
          <span className="font-cn text-[10px] text-[var(--color-ink-3)]">{asText(doc.eyebrow)}</span>
        </span>

        <span className="flex items-center gap-[6px]">
          <span className="font-cn text-[21px] font-bold leading-none text-[var(--color-ink)]">{asText(doc.name)}</span>
          {latin ? (
            <>
              <span className="font-cn text-[21px] font-bold leading-none text-[var(--color-primary)]">·</span>
              <span className="font-latin text-[21px] font-bold leading-none text-[var(--color-ink)]">{latin}</span>
            </>
          ) : null}
        </span>

        <span className="font-cn text-[12px] font-medium leading-[1.6] text-[var(--color-ink)]">
          {asText(doc.subline)}
        </span>
        <span className="font-cn text-[10.5px] leading-[1.65] text-[var(--color-ink-3)]">
          {asText(doc.paragraph)}
        </span>

        {showTrust && asText(doc.trust) ? (
          <span className="font-cn text-[9.5px] leading-[1.6] text-[var(--admin-placeholder)]">{asText(doc.trust)}</span>
        ) : null}

        <span className="flex items-center gap-[8px] pt-[2px]">
          <span className="inline-flex h-[28px] items-center rounded-full bg-[var(--color-primary)] px-[12px] font-cn text-[10px] text-white">
            {asText(readPath(doc, 'primaryAction.label'))}
          </span>
          <span className="inline-flex h-[28px] items-center rounded-full border border-[var(--color-line)] bg-[var(--admin-surface)] px-[12px] font-cn text-[10px] text-[var(--color-ink-2)]">
            {asText(readPath(doc, 'secondaryAction.label'))}
          </span>
        </span>

        {showImage ? (
          <span className="flex h-[46px] items-center justify-center rounded-[10px] bg-gradient-to-br from-[#fbdcc4] to-[#f6efe6] font-cn text-[9px] text-[#c08a5c]">
            {copy.preview.imageLabel}
          </span>
        ) : (
          <span className="font-cn text-[9px] text-[var(--admin-placeholder)]">{copy.preview.imageHidden}</span>
        )}
      </div>

      <GhostBelow />
    </>
  )
}

/** 首屏之下的内容在画布上是灰块占位（`13:897`）—— 如实表达「这一屏不管下面那些」。 */
function GhostBelow() {
  return (
    <div className="flex flex-col gap-[11px] border-t border-[var(--color-line-soft)] px-[16px] pb-[16px] pt-[14px]">
      <span className="font-cn text-[9px] text-[#c6bfb7]">{copy.preview.belowFold}</span>
      <span className="h-[58px] rounded-[10px] bg-[#faf7f4]" />
      <span className="flex items-center gap-[6px]">
        {[0, 1, 2, 3, 4].map((i) => (
          <span key={i} className="h-[24px] w-[24px] rounded-[7px] bg-[#f1ece6]" />
        ))}
      </span>
      <span className="flex items-center gap-[10px]">
        <span className="h-[52px] flex-1 rounded-[10px] bg-[#f6f1eb]" />
        <span className="h-[52px] flex-1 rounded-[10px] bg-[#f6f1eb]" />
      </span>
    </div>
  )
}

function AboutPreview({ doc }: { doc: SectionData }) {
  const skills = asList(doc.skills).map(asText)
  const strengths = asList(doc.strengths).map(asText)
  const stats = asRows(doc.stats)

  return (
    <div className="flex flex-col gap-[12px] px-[16px] py-[16px]">
      <span className="font-cn text-[10px] font-medium leading-none text-[var(--color-ink-3)]">技能</span>
      <span className="flex flex-wrap gap-[5px]">
        {skills.map((s, i) => (
          <span
            key={i}
            className="rounded-full border border-[var(--color-line)] px-[9px] py-[3px] font-cn text-[9.5px] text-[var(--color-ink-2)]"
          >
            {s}
          </span>
        ))}
      </span>
      {asText(doc.skillsNote) ? (
        <span className="font-cn text-[9.5px] leading-[1.6] text-[var(--admin-placeholder)]">
          {asText(doc.skillsNote)}
        </span>
      ) : null}

      <span className="font-cn text-[10px] font-medium leading-none text-[var(--color-ink-3)]">数据条</span>
      <span className="flex items-start gap-[10px]">
        {stats.map((s, i) => (
          <span key={i} className="flex flex-1 flex-col gap-[3px]">
            <span className="font-latin text-[15px] font-bold leading-none text-[var(--color-ink)]">
              {asText(s.value)}
            </span>
            <span className="font-cn text-[9px] leading-none text-[var(--admin-placeholder)]">{asText(s.label)}</span>
          </span>
        ))}
      </span>

      <span className="font-cn text-[10px] font-medium leading-none text-[var(--color-ink-3)]">优势</span>
      <span className="flex flex-col gap-[5px]">
        {strengths.map((s, i) => (
          <span
            key={i}
            className="flex items-start gap-[6px] font-cn text-[9.5px] leading-[1.6] text-[var(--color-ink-2)]"
          >
            <span className="mt-[4px] h-[4px] w-[4px] shrink-0 rounded-full bg-[var(--color-primary)]" />
            {s}
          </span>
        ))}
      </span>
    </div>
  )
}

function StackPreview({ doc }: { doc: SectionData }) {
  const items = asRows(doc.items)
  return (
    <div className="flex flex-col gap-[10px] px-[16px] py-[16px]">
      <span className="grid grid-cols-2 gap-[8px]">
        {items.map((item, i) => (
          <span
            key={i}
            className="flex flex-col gap-[3px] rounded-[10px] border border-[var(--color-line)] px-[10px] py-[8px]"
          >
            <span className="font-cn text-[10.5px] font-medium leading-none text-[var(--color-ink)]">
              {asText(item.name)}
            </span>
            <span className="font-cn text-[9px] leading-none text-[var(--admin-placeholder)]">{asText(item.sub)}</span>
          </span>
        ))}
      </span>
      {asText(doc.note) ? (
        <span className="font-cn text-[9px] text-[var(--admin-placeholder)]">{asText(doc.note)}</span>
      ) : null}
    </div>
  )
}

function FooterPreview({ footer }: { footer: SettingGroup | null }) {
  const value = (key: string) => {
    const field = footer?.fields.find((f) => f.key === key)
    return typeof field?.value === 'string' ? field.value : ''
  }

  return (
    <div className="flex flex-col gap-[9px] bg-[#241f1b] px-[16px] py-[16px]">
      <span className="font-cn text-[12px] font-bold leading-[1.5] text-white/90">{value('footerQuote')}</span>
      <span className="font-cn text-[9.5px] leading-[1.7] text-white/50">{value('footerNote')}</span>
      <span className="mt-[2px] border-t border-white/10 pt-[8px] font-cn text-[9px] text-white/40">
        {value('copyright')}
      </span>
    </div>
  )
}
