/**
 * 站点设置。
 *
 * 分区与字段由服务端下发（`/api/admin/settings`）——这里不重复声明一遍，
 * 否则「后端校验字段」和「前端渲染字段」会变成两份会发散的清单。
 *
 * 保存粒度是**整屏的未保存草稿**，但提交时只发有变化的字段：
 * 把整屏回写容易覆盖掉并行的另一次修改（比如另一个标签页刚改过的开关）。
 *
 * 未保存离开时提示：表单里有二十多个字段，误点侧边栏丢掉一次编辑的成本很高。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { adminSettingsCopy as copy } from '../../data/admin'
import { ApiError, adminApi, type SettingField, type SettingGroup } from '../adminApi'
import { ExternalIcon } from '../AdminIcons'
import {
  AdminCard,
  Button,
  CardHead,
  ConfirmDialog,
  ControlSelect,
  Field,
  HeaderButton,
  Notice,
  PageHeader,
  SectionNavCard,
  SwitchRow,
  TextArea,
  TextInput,
} from '../ui'

/** 本地草稿：字段 key → 待提交值。未在草稿里的字段沿用服务端值。 */
type Draft = Record<string, string | boolean>

/**
 * 目标 lib 是 ES2020，没有 `Object.hasOwn`。
 * 这里必须用 hasOwnProperty 而不是 `key in draft` —— 后者会把原型链上的键也算命中。
 */
const has = (obj: Draft, key: string) => Object.prototype.hasOwnProperty.call(obj, key)

const formatSavedAt = (iso: string | null) => {
  if (!iso) return copy.neverSaved
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

export default function AdminSettings() {
  const [groups, setGroups] = useState<SettingGroup[]>([])
  const [active, setActive] = useState('basic')
  const [draft, setDraft] = useState<Draft>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [leaving, setLeaving] = useState(false)

  const load = useCallback(async (signal?: { cancelled: boolean }) => {
    setLoading(true)
    setError('')
    try {
      const res = await adminApi.settings()
      if (signal?.cancelled) return
      setGroups(res.groups)
      setDraft({})
      setActive((prev) => (res.groups.some((g) => g.key === prev) ? prev : (res.groups[0]?.key ?? 'basic')))
    } catch (err) {
      if (signal?.cancelled) return
      setError(err instanceof ApiError ? err.message : copy.error)
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

  const group = groups.find((g) => g.key === active) ?? groups[0]

  /** 当前分区的未保存变更。只在同分区内比较，切分区不会把别的分区算进来。 */
  const changes = useMemo(() => {
    if (!group) return [] as { key: string; value: string | boolean }[]
    return group.fields
      .filter((f) => f.type !== 'readonly' && has(draft, f.key))
      .map((f) => ({ key: f.key, value: draft[f.key] }))
      .filter((c) => c.value !== group.fields.find((f) => f.key === c.key)?.value)
  }, [group, draft])

  /** 全屏是否还有别的分区没保存 —— 切分区时不提示，但顶部会挂一个总标记。 */
  const dirtyKeys = useMemo(() => {
    const all = new Set<string>()
    for (const g of groups) {
      for (const f of g.fields) {
        if (f.type === 'readonly') continue
        if (has(draft, f.key) && draft[f.key] !== f.value) all.add(f.key)
      }
    }
    return all
  }, [groups, draft])

  useEffect(() => {
    if (dirtyKeys.size === 0) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirtyKeys])

  const setField = (field: SettingField, value: string | boolean) => {
    setDraft((prev) => ({ ...prev, [field.key]: value }))
    setNotice('')
  }

  const save = async () => {
    if (changes.length === 0) return
    setSaving(true)
    setNotice('')
    setError('')
    try {
      const payload: Record<string, string | boolean> = {}
      for (const c of changes) payload[c.key] = c.value
      const res = await adminApi.saveSettings(payload)
      setGroups(res.groups)
      setDraft((prev) => {
        const next = { ...prev }
        for (const c of changes) delete next[c.key]
        return next
      })
      setNotice(
        res.changed.length > 0
          ? copy.saved.replace('{n}', String(res.changed.length))
          : copy.noChange
      )
    } catch (err) {
      setError(err instanceof ApiError ? err.message : copy.saveError)
    } finally {
      setSaving(false)
    }
  }

  const discard = () => {
    setDraft({})
    setNotice(copy.revert)
    setLeaving(false)
  }

  const switchSection = (key: string) => {
    // 切分区不拦：草稿保留在 state 里，回来还在。只有「离开页面」才需要确认。
    setActive(key)
    setNotice('')
  }

  const siteUrl = (groups.find((g) => g.key === 'domain')?.fields ?? []).find((f) => f.key === 'siteUrl')
  const previewHref =
    (typeof siteUrl?.value === 'string' && siteUrl.value) || (typeof draft.siteUrl === 'string' && draft.siteUrl) || '/'

  return (
    <div className="flex min-h-full flex-col gap-[18px]">
      <PageHeader
        title={copy.title}
        subtitle={copy.subtitle}
        /*
         * 画布这一屏的页头只有一个按钮（13:1515「查看站点」），此前多加的「重新载入」
         * 既偏离规格、又与底部「取消」职责重叠，已移到未保存提示条上——
         * 那里才是它真正独有的能力（清掉跨分区累积的草稿）出现的时机。
         */
        right={
          <HeaderButton
            icon={<ExternalIcon className="h-[14px] w-[14px]" />}
            onClick={() => window.open(previewHref, '_blank', 'noopener,noreferrer')}
          >
            {copy.viewSite}
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
      {dirtyKeys.size > 0 && !notice ? (
        <Notice tone="warn">
          {copy.unsaved}
          <button type="button" onClick={() => setLeaving(true)} className="ml-[8px] underline">
            {copy.discardAll}
          </button>
        </Notice>
      ) : null}

      <div className="flex flex-1 items-start gap-[20px]">
        <SectionNavCard
          items={groups.map((g) => ({ key: g.key, label: g.label }))}
          active={group?.key ?? active}
          onChange={switchSection}
        />

        {loading && !group ? (
          <AdminCard className="min-h-[420px] flex-1" />
        ) : group ? (
          <AdminCard className="flex min-h-[420px] flex-1 flex-col">
            <CardHead title={group.label} subtitle={group.subtitle} right={<GroupBadge group={group} />} />

            <div className="flex flex-1 flex-col gap-[18px] px-[22px] py-[22px]">
              {group.notice ? <Notice tone="info">{group.notice}</Notice> : null}
              {group.fields.map((field) => (
                <FieldRow
                  key={field.key}
                  field={field}
                  value={has(draft, field.key) ? draft[field.key] : field.value}
                  onChange={(v) => setField(field, v)}
                />
              ))}
            </div>

            <span className="h-px w-full bg-[var(--color-line)]" aria-hidden="true" />
            <div className="flex flex-wrap items-center justify-between gap-[12px] px-[22px] py-[16px]">
              <span className="font-cn text-[11px] text-[var(--color-ink-3)]">
                {group.readOnly
                  ? '该分区由运行环境决定，不可编辑'
                  : copy.savedAt.replace('{time}', formatSavedAt(group.savedAt))}
              </span>
              {group.readOnly ? null : (
                <div className="flex items-center gap-[10px]">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={changes.length === 0 || saving}
                    onClick={() => setDraft((prev) => {
                      const next = { ...prev }
                      for (const f of group.fields) delete next[f.key]
                      return next
                    })}
                  >
                    {copy.cancel}
                  </Button>
                  <Button size="sm" loading={saving} disabled={changes.length === 0} onClick={() => void save()}>
                    {copy.save}
                  </Button>
                </div>
              )}
            </div>
          </AdminCard>
        ) : null}
      </div>

      <ConfirmDialog
        open={leaving}
        title={copy.discard}
        tone="danger"
        confirmLabel={copy.cancel}
        cancelLabel="继续编辑"
        message={`当前有 ${dirtyKeys.size} 项修改尚未保存，放弃后将恢复为已保存的值。`}
        onCancel={() => setLeaving(false)}
        onConfirm={discard}
      />
    </div>
  )
}

/* ------------------------------------------------------------------ 分区标记 */
function GroupBadge({ group }: { group: SettingGroup }) {
  if (group.readOnly) {
    return (
      <span className="inline-flex h-[22px] items-center rounded-full bg-[var(--admin-soft-strong)] px-[10px] font-cn text-[11px] font-medium text-[var(--color-ink-3)]">
        {copy.readonly}
      </span>
    )
  }
  return null
}

/* ------------------------------------------------------------------ 字段 */
function FieldRow({
  field,
  value,
  onChange,
}: {
  field: SettingField
  value: string | boolean
  onChange: (next: string | boolean) => void
}) {
  if (field.type === 'readonly') {
    return (
      <Field label={field.label} hint={field.hint ?? undefined}>
        <span className="flex min-h-[38px] items-center rounded-[10px] border border-[var(--admin-soft-strong)] bg-[var(--admin-readonly)] px-[13px] font-latin text-[12.5px] text-[var(--color-ink-2)]">
          {String(value)}
        </span>
      </Field>
    )
  }

  if (field.type === 'switch') {
    return (
      <SwitchRow
        checked={Boolean(value)}
        onChange={onChange}
        label={field.label}
        hint={field.hint ?? undefined}
      />
    )
  }

  if (field.type === 'select') {
    return (
      <Field label={field.label} hint={field.hint ?? undefined}>
        <ControlSelect
          ariaLabel={field.label}
          className="w-full [&>select]:h-[38px] [&>select]:w-full"
          value={String(value)}
          onChange={onChange}
          options={field.options ?? []}
        />
      </Field>
    )
  }

  if (field.type === 'textarea') {
    return (
      <Field
        label={field.label}
        hint={field.hint ?? undefined}
        right={field.max ? <Counter value={String(value)} max={field.max} /> : undefined}
      >
        <TextArea
          rows={field.rows ?? 3}
          value={String(value)}
          placeholder={field.placeholder ?? undefined}
          maxLength={field.max ?? undefined}
          onChange={(e) => onChange(e.target.value)}
        />
      </Field>
    )
  }

  return (
    <Field
      label={field.label}
      hint={field.hint ?? undefined}
      right={field.max ? <Counter value={String(value)} max={field.max} /> : undefined}
    >
      <TextInput
        type={field.type === 'number' ? 'number' : 'text'}
        value={String(value)}
        placeholder={field.placeholder ?? undefined}
        maxLength={field.type === 'number' ? undefined : (field.max ?? undefined)}
        min={field.type === 'number' ? 1 : undefined}
        onChange={(e) => onChange(e.target.value)}
      />
    </Field>
  )
}

/** 字数计数。超限时变红 —— 服务端也会拒，但让用户在敲的时候就看见比事后报错好。 */
function Counter({ value, max }: { value: string; max: number }) {
  const over = value.length > max
  return (
    <span
      className={[
        'font-latin text-[10.5px]',
        over ? 'text-[#b4460c]' : 'text-[var(--admin-placeholder)]',
      ].join(' ')}
    >
      {value.length} / {max}
    </span>
  )
}
