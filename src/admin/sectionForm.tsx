/**
 * 区块表单的共用零件。
 *
 * 首页内容与简历两屏是同一类界面：一张表单卡 + 一列字段 + 若干「可增删排序的列表」。
 * 它们共用的是**零件**而不是整个页面 —— 两屏的字段排布各自不同（首屏是两列复合字段，
 * 简历是「条目里还挂着条目」的两层结构），硬抽一层通用表单引擎会把这个差异藏起来。
 *
 * 之所以要抽：`RecordsEditor` 这类零件有上百行，两屏各写一份，改一处漏一处
 * 就会变成「首页能删条目、简历删不掉」这种只有逐个点过才会发现的发散。
 *
 * 字段约束（字数上限、必填、条数上限）**不在这里**，由服务端随区块下发，
 * 源头是 `shared/sections.mjs`（见那里的文件头注释）。
 */
import type { ReactNode } from 'react'
import { ArrowDownIcon, ArrowUpIcon, PlusIcon, XIcon } from './AdminIcons'
import { adminFormCopy as copy } from '../data/admin'
import { Button, Field, TextArea, TextInput } from './ui'
import type { SectionData, SectionListRule } from './adminApi'

/* ------------------------------------------------------------------ 路径读写 */

/** 按点号路径取值。缺任何一层都返回 undefined —— 草稿是逐步填起来的，缺键是常态。 */
export function readPath(doc: SectionData | undefined, path: string): unknown {
  let cur: unknown = doc
  for (const part of path.split('.')) {
    if (cur === null || typeof cur !== 'object') return undefined
    cur = (cur as Record<string, unknown>)[part]
  }
  return cur
}

export const asText = (v: unknown) =>
  typeof v === 'string' ? v : v === undefined || v === null ? '' : String(v)
export const asBool = (v: unknown) => v === true
export const asList = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
export const asRows = (v: unknown): Record<string, unknown>[] =>
  asList(v).map((r) => (r !== null && typeof r === 'object' ? (r as Record<string, unknown>) : {}))

/**
 * 写回路径，返回**新对象**。
 *
 * 不原地改：草稿与「已保存的值」要各自留存才能算差异 —— 原地改的话
 * 改草稿等于改基线，「有没有未保存的修改」就永远算不出来。
 */
export function setPath(doc: SectionData, path: string, value: unknown): SectionData {
  const parts = path.split('.')
  const next: SectionData = { ...doc }
  let cursor: Record<string, unknown> = next
  for (const part of parts.slice(0, -1)) {
    const child = cursor[part]
    cursor[part] = child !== null && typeof child === 'object' && !Array.isArray(child) ? { ...child } : {}
    cursor = cursor[part] as Record<string, unknown>
  }
  cursor[parts[parts.length - 1]] = value
  return next
}

/* ------------------------------------------------------------------ 时间显示 */

/** 画布上写的是「上次保存 · 2 分钟前」，所以近处用相对时间，远处才落成日期。 */
export function formatSavedAt(iso: string | null, neverSaved: string): string {
  if (!iso) return neverSaved
  const then = new Date(iso)
  if (Number.isNaN(then.getTime())) return iso
  const diff = Date.now() - then.getTime()
  if (diff < 60_000) return '刚刚'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`
  const p = (n: number) => String(n).padStart(2, '0')
  return `${then.getFullYear()}-${p(then.getMonth() + 1)}-${p(then.getDate())} ${p(then.getHours())}:${p(then.getMinutes())}`
}

/* ------------------------------------------------------------------ 页头 */

export function SectionHead({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="flex flex-col gap-[4px]">
      <h2 className="font-cn text-[14px] font-semibold leading-none text-[var(--color-ink)]">{title}</h2>
      <p className="font-cn text-[11.5px] leading-[1.65] text-[var(--color-ink-3)]">{desc}</p>
    </div>
  )
}

/* ------------------------------------------------------------------ 通用字段 */

/** 字数计数。超限变红 —— 服务端也会拒，但敲的时候就看见比事后报错好。 */
export function Counter({ value, max }: { value: string; max: number }) {
  const over = value.length > max
  return (
    <span className={['font-latin text-[10.5px]', over ? 'text-[#b4460c]' : 'text-[var(--admin-placeholder)]'].join(' ')}>
      {value.length} / {max}
    </span>
  )
}

export function TextRow({
  label,
  hint,
  value,
  max,
  rows,
  onChange,
}: {
  label: string
  hint?: string
  value: string
  max?: number
  rows?: number
  onChange: (next: string) => void
}) {
  return (
    <Field label={label} hint={hint} right={max === undefined ? undefined : <Counter value={value} max={max} />}>
      {rows ? (
        <TextArea rows={rows} value={value} maxLength={max} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <TextInput value={value} maxLength={max} onChange={(e) => onChange(e.target.value)} />
      )}
    </Field>
  )
}

/** 两列并排的一组字段（主标题、行动按钮），与画布的 CTA Columns 一致。 */
export function ColumnRow({ children }: { children: ReactNode }) {
  return <div className="flex items-start gap-[12px]">{children}</div>
}

/** 列内的小标题 + 输入框。画布上「主按钮 · 文案」就是这一款。 */
export function SubInput({
  caption,
  value,
  max,
  onChange,
}: {
  caption: string
  value: string
  max?: number
  onChange: (next: string) => void
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-[6px]">
      <span className="font-cn text-[11px] leading-none text-[var(--color-ink-3)]">{caption}</span>
      <TextInput value={value} maxLength={max} onChange={(e) => onChange(e.target.value)} />
    </div>
  )
}

/** 「最多 N 条」这句在规格里，不必每屏再抄一遍。 */
export function hintOf(rule?: SectionListRule): string | undefined {
  return rule ? copy.limit.replace('{n}', String(rule.maxItems)) : undefined
}

/* ------------------------------------------------------------------ 列表编辑器 */

/** 一行一条的文本清单（技能、优势、要点）。顺序即前台展示顺序。 */
export function ChipsEditor({
  rule,
  items,
  onChange,
}: {
  rule?: SectionListRule
  items: string[]
  onChange: (next: string[]) => void
}) {
  if (!rule) return null

  return (
    <Field label={rule.label ?? ''} hint={hintOf(rule)}>
      <div className="flex flex-col gap-[8px]">
        {items.map((item, index) => (
          <div key={index} className="flex items-start gap-[8px]">
            {rule.itemType === 'textarea' ? (
              <TextArea
                rows={2}
                value={item}
                maxLength={rule.itemMax}
                aria-label={`第 ${index + 1} 条`}
                onChange={(e) => {
                  const next = [...items]
                  next[index] = e.target.value
                  onChange(next)
                }}
              />
            ) : (
              <TextInput
                value={item}
                maxLength={rule.itemMax}
                aria-label={`第 ${index + 1} 条`}
                onChange={(e) => {
                  const next = [...items]
                  next[index] = e.target.value
                  onChange(next)
                }}
              />
            )}
            <button
              type="button"
              onClick={() => onChange(items.filter((_, i) => i !== index))}
              aria-label={copy.chipRemove}
              title={copy.chipRemove}
              className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[9px] text-[var(--color-ink-3)] transition-colors hover:bg-[#fdf1e8] hover:text-[#b4460c]"
            >
              <XIcon className="h-[13px] w-[13px]" />
            </button>
          </div>
        ))}
        {items.length === 0 ? (
          <span className="font-cn text-[11.5px] text-[var(--color-ink-3)]">{copy.empty}</span>
        ) : null}
        <Button
          variant="outline"
          size="sm"
          className="w-fit"
          disabled={items.length >= rule.maxItems}
          icon={<PlusIcon className="h-[13px] w-[13px]" />}
          onClick={() => onChange([...items, ''])}
        >
          {copy.add.replace('{unit}', '一条')}
        </Button>
      </div>
    </Field>
  )
}

/**
 * 对象数组（工作经历、数据条、技术栈条目、技能行）：每条一格卡片，可增删、可上下移动。
 *
 * 条目内部除了标量字段，还可能挂**嵌套列表**（工作经历条目下既有一串要点，
 * 又挂着若干项目，那些项目自己也带要点）。嵌套是递归渲染的 —— 结构与外层同构，
 * 所以不需要第二套零件。
 */
export function RecordsEditor({
  rule,
  rows,
  onChange,
}: {
  rule?: SectionListRule
  rows: Record<string, unknown>[]
  onChange: (next: Record<string, unknown>[]) => void
}) {
  if (!rule) return null

  const setCell = (index: number, key: string, value: unknown) =>
    onChange(rows.map((row, i) => (i === index ? { ...row, [key]: value } : row)))

  const move = (index: number, delta: number) => {
    const target = index + delta
    if (target < 0 || target >= rows.length) return
    const next = [...rows]
    const [row] = next.splice(index, 1)
    next.splice(target, 0, row)
    onChange(next)
  }

  /**
   * 新增一条时把每个字段先填上空值、每个嵌套列表先填上空数组。
   * 缺键的受控输入会在「受控 / 非受控」之间来回切，React 会为此报警告，
   * 而且用户第一次敲字时可能丢掉字符。
   */
  const addRow = () => {
    const blank: Record<string, unknown> = {}
    for (const [key, field] of Object.entries(rule.itemFields ?? {})) {
      blank[key] = field.type === 'bool' ? false : ''
    }
    for (const key of Object.keys(rule.itemLists ?? {})) blank[key] = []
    onChange([...rows, blank])
  }

  return (
    <Field label={rule.label ?? ''} hint={hintOf(rule)}>
      <div className="flex flex-col gap-[10px]">
        {rows.map((row, index) => (
          <div
            key={index}
            className="flex flex-col gap-[10px] rounded-[12px] border border-[var(--color-line)] bg-[var(--admin-readonly)] px-[14px] py-[12px]"
          >
            <div className="flex items-center justify-between gap-[8px]">
              <span className="font-cn text-[11px] text-[var(--color-ink-3)]">
                第 {index + 1} {rule.itemLabel ?? '条'}
              </span>
              <div className="flex items-center gap-[2px]">
                <RowIconButton label={copy.moveUp} disabled={index === 0} onClick={() => move(index, -1)}>
                  <ArrowUpIcon className="h-[13px] w-[13px]" />
                </RowIconButton>
                <RowIconButton
                  label={copy.moveDown}
                  disabled={index === rows.length - 1}
                  onClick={() => move(index, 1)}
                >
                  <ArrowDownIcon className="h-[13px] w-[13px]" />
                </RowIconButton>
                <RowIconButton
                  label={copy.remove}
                  danger
                  onClick={() => onChange(rows.filter((_, i) => i !== index))}
                >
                  <XIcon className="h-[13px] w-[13px]" />
                </RowIconButton>
              </div>
            </div>

            <div className="flex flex-col gap-[10px]">
              {Object.entries(rule.itemFields ?? {}).map(([key, field]) => (
                <Field
                  key={key}
                  label={field.label ?? key}
                  right={
                    field.max === undefined ? undefined : <Counter value={asText(row[key])} max={field.max} />
                  }
                >
                  {field.type === 'textarea' ? (
                    <TextArea
                      rows={2}
                      value={asText(row[key])}
                      maxLength={field.max}
                      onChange={(e) => setCell(index, key, e.target.value)}
                    />
                  ) : (
                    <TextInput
                      value={asText(row[key])}
                      maxLength={field.max}
                      onChange={(e) => setCell(index, key, e.target.value)}
                    />
                  )}
                </Field>
              ))}

              {Object.entries(rule.itemLists ?? {}).map(([key, child]) =>
                child.type === 'chips' ? (
                  <ChipsEditor
                    key={key}
                    rule={child}
                    items={asList(row[key]).map(asText)}
                    onChange={(next) => setCell(index, key, next)}
                  />
                ) : (
                  <RecordsEditor
                    key={key}
                    rule={child}
                    rows={asRows(row[key])}
                    onChange={(next) => setCell(index, key, next)}
                  />
                )
              )}
            </div>
          </div>
        ))}

        {rows.length === 0 ? (
          <span className="font-cn text-[11.5px] text-[var(--color-ink-3)]">{copy.empty}</span>
        ) : null}

        <Button
          variant="outline"
          size="sm"
          className="w-fit"
          disabled={rows.length >= rule.maxItems}
          icon={<PlusIcon className="h-[13px] w-[13px]" />}
          onClick={addRow}
        >
          {copy.add.replace('{unit}', rule.itemLabel ?? '一条')}
        </Button>
      </div>
    </Field>
  )
}

export function RowIconButton({
  label,
  onClick,
  disabled = false,
  danger = false,
  children,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  danger?: boolean
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={[
        'flex h-[26px] w-[26px] items-center justify-center rounded-[8px] transition-colors disabled:cursor-not-allowed disabled:opacity-40',
        danger
          ? 'text-[var(--color-ink-3)] hover:bg-[#fdf1e8] hover:text-[#b4460c]'
          : 'text-[var(--color-ink-3)] hover:bg-[var(--admin-soft-strong)] hover:text-[var(--color-ink)]',
      ].join(' ')}
    >
      {children}
    </button>
  )
}
