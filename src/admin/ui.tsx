/**
 * 后台通用 UI 原子。
 *
 * 刻意不追求和展示站共用组件：两边密度不同（后台 12–13px 正文、38px 控件高、
 * 圆角 8/10/16 的层级），硬抽一层公共组件会同时拖累两边。
 * 共用的是**设计令牌**（见 index.css 的 --admin-* 与 --color-*），不是组件。
 *
 * 后台内部则相反：8 个功能页的筛选条、下拉、行菜单长得一样，各写一份必然发散
 * （第一版就把同一个 select 在文章列表里写过一次）。所以后台共用一套原子。
 */
import { useEffect, useMemo, useRef, useState, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { createPortal } from 'react-dom'
import { AlertIcon, ArrowLeftIcon, ArrowRightIcon, CheckIcon, ChevronDownIcon, MoreIcon, XIcon } from './AdminIcons'

/* --------------------------------------------------------------------- 卡片 */
export function AdminCard({
  children,
  className = '',
  padded = false,
}: {
  /** 可为空：骨架屏就是一块不带内容的空卡片 */
  children?: ReactNode
  className?: string
  padded?: boolean
}) {
  return (
    <section
      className={[
        'overflow-hidden rounded-[16px] border border-[var(--color-line)] bg-[var(--admin-surface)]',
        padded ? 'p-[24px]' : '',
        className,
      ].join(' ')}
    >
      {children}
    </section>
  )
}

export function CardHead({
  title,
  subtitle,
  right,
  divider = true,
}: {
  title: ReactNode
  subtitle?: ReactNode
  right?: ReactNode
  divider?: boolean
}) {
  return (
    <>
      <header className="flex items-start justify-between gap-[16px] px-[24px] py-[18px]">
        <div className="flex min-w-0 flex-col gap-[5px]">
          <h2 className="font-cn text-[14px] font-semibold leading-none text-[var(--color-ink)]">
            {title}
          </h2>
          {subtitle ? (
            <p className="font-cn text-[11.5px] leading-[1.6] text-[var(--color-ink-3)]">{subtitle}</p>
          ) : null}
        </div>
        {right ? <div className="flex shrink-0 items-center gap-[10px]">{right}</div> : null}
      </header>
      {divider ? <div className="h-px bg-[var(--color-line)]" /> : null}
    </>
  )
}

export function CardFoot({ left, children }: { left?: ReactNode; children?: ReactNode }) {
  return (
    <>
      <div className="h-px bg-[var(--color-line)]" />
      <footer className="flex flex-wrap items-center justify-between gap-[12px] px-[24px] py-[16px]">
        <span className="font-cn text-[11px] text-[var(--color-ink-3)]">{left}</span>
        <div className="flex items-center gap-[10px]">{children}</div>
      </footer>
    </>
  )
}

export const Divider = () => <div className="h-px bg-[var(--color-line)]" />

/* --------------------------------------------------------------------- 表单 */
export function Field({
  label,
  hint,
  htmlFor,
  children,
  right,
}: {
  label: ReactNode
  hint?: ReactNode
  htmlFor?: string
  children: ReactNode
  right?: ReactNode
}) {
  return (
    <div className="flex flex-col gap-[7px]">
      <div className="flex items-center justify-between gap-[10px]">
        <label
          htmlFor={htmlFor}
          className="font-cn text-[11.5px] font-medium text-[var(--color-ink-3)]"
        >
          {label}
        </label>
        {right}
      </div>
      {children}
      {hint ? (
        <p className="font-cn text-[10.5px] leading-[1.6] text-[var(--color-ink-3)]">{hint}</p>
      ) : null}
    </div>
  )
}

const controlBase =
  'w-full rounded-[10px] border bg-[var(--admin-soft)] px-[13px] font-cn text-[13px] text-[var(--color-ink)] ' +
  'outline-none transition-colors placeholder:text-[var(--admin-placeholder)] ' +
  'border-[var(--color-line)] focus:border-[var(--color-primary)] focus:bg-[var(--admin-surface)] ' +
  'disabled:cursor-not-allowed disabled:text-[var(--color-ink-3)] disabled:bg-[var(--admin-soft-strong)]'

export function TextInput({
  invalid = false,
  className = '',
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  return (
    <input
      {...props}
      aria-invalid={invalid || undefined}
      className={[
        controlBase,
        'h-[38px]',
        invalid ? 'border-[#d2560f] focus:border-[#d2560f]' : '',
        className,
      ].join(' ')}
    />
  )
}

/** 只读展示框：底更浅、字更灰，右侧可挂一个锁一类的图标。 */
export function ReadonlyValue({ children, icon }: { children: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex h-[38px] items-center justify-between gap-[10px] rounded-[10px] border border-[var(--admin-soft-strong)] bg-[var(--admin-readonly)] px-[13px]">
      <span className="truncate font-cn text-[13px] text-[var(--color-ink-3)]">{children}</span>
      {icon}
    </div>
  )
}

export function TextArea({
  className = '',
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={[controlBase, 'py-[10px] leading-[1.7]', className].join(' ')} />
}

/**
 * 表单里的下拉，与 `TextInput` 同一套尺寸（38 高、圆角 10）。
 *
 * 工具条那个 `ControlSelect` 是 30 高的紧凑版，两者不能混用：
 * 同一行里出现一高一矮两个控件，读起来像是坏了。
 *
 * 用原生 `select` 的理由与 `ControlSelect` 相同，见那里的注释。
 */
export function SelectInput({
  className = '',
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { children: ReactNode }) {
  return (
    <div className={['relative', className].join(' ')}>
      <select {...props} className={[controlBase, 'h-[38px] cursor-pointer appearance-none pr-[34px]'].join(' ')}>
        {children}
      </select>
      <ChevronDownIcon className="pointer-events-none absolute right-[13px] top-1/2 h-[14px] w-[14px] -translate-y-1/2 text-[var(--color-ink-3)]" />
    </div>
  )
}

/* --------------------------------------------------------------------- 按钮 */
type ButtonVariant = 'primary' | 'outline' | 'ghost' | 'danger'

const buttonVariants: Record<ButtonVariant, string> = {
  primary:
    'bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-deep)] disabled:bg-[var(--color-primary)]/50',
  outline:
    'border border-[var(--color-line)] bg-[var(--admin-surface)] text-[var(--color-ink-2)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]',
  ghost: 'text-[var(--color-ink-2)] hover:bg-[var(--admin-soft)]',
  danger:
    'border border-[var(--color-line)] bg-[var(--admin-surface)] text-[#b4460c] hover:border-[#d2560f] hover:bg-[#fdf1e8]',
}

export function Button({
  variant = 'primary',
  size = 'md',
  block = false,
  loading = false,
  icon,
  children,
  className = '',
  ...props
}: {
  variant?: ButtonVariant
  size?: 'sm' | 'md'
  block?: boolean
  loading?: boolean
  icon?: ReactNode
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const heights = size === 'sm' ? 'h-[32px] px-[12px] text-[12px]' : 'h-[38px] px-[16px] text-[12.5px]'
  return (
    <button
      type="button"
      {...props}
      disabled={props.disabled || loading}
      className={[
        'inline-flex items-center justify-center gap-[7px] rounded-[10px] font-cn font-medium leading-none transition-colors',
        'disabled:cursor-not-allowed disabled:opacity-60',
        heights,
        buttonVariants[variant],
        block ? 'w-full' : '',
        className,
      ].join(' ')}
    >
      {loading ? (
        <span className="h-[13px] w-[13px] animate-spin rounded-full border-[1.6px] border-current border-t-transparent" />
      ) : (
        icon
      )}
      {children}
    </button>
  )
}

/* --------------------------------------------------------------------- 标记 */
export function Badge({
  tone = 'neutral',
  children,
}: {
  tone?: 'neutral' | 'success' | 'warn' | 'muted'
  children: ReactNode
}) {
  const tones = {
    neutral: 'bg-[var(--color-primary-soft)] text-[var(--color-primary)]',
    success: 'bg-[#eef7f0] text-[#3f7f52]',
    warn: 'bg-[#fdf3e7] text-[#a8611a]',
    muted: 'bg-[var(--admin-soft-strong)] text-[var(--color-ink-3)]',
  }
  return (
    <span
      className={[
        'inline-flex h-[22px] items-center rounded-full px-[10px] font-cn text-[11px] font-medium leading-none',
        tones[tone],
      ].join(' ')}
    >
      {children}
    </span>
  )
}

export function PostStatusBadge({
  status,
  labels,
}: {
  status: string
  labels: { published: string; draft: string; trash?: string }
}) {
  if (status === 'trash') return <Badge tone="muted">{labels.trash ?? '回收站'}</Badge>
  const published = status === 'published'
  return <Badge tone={published ? 'success' : 'warn'}>{published ? labels.published : labels.draft}</Badge>
}

/** 首字母/首字圆形标识，暂时替代头像上传。 */
export function Monogram({
  text,
  size = 36,
  tone = 'solid',
}: {
  text: string
  size?: number
  tone?: 'solid' | 'soft'
}) {
  return (
    <span
      style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }}
      className={[
        'inline-flex shrink-0 items-center justify-center rounded-full font-cn font-semibold',
        tone === 'solid'
          ? 'bg-[var(--color-primary)] text-white'
          : 'bg-[var(--color-primary-soft)] text-[var(--color-primary)]',
      ].join(' ')}
    >
      {text}
    </span>
  )
}

/* --------------------------------------------------------------------- 提示条 */
export function Notice({
  tone = 'info',
  children,
  onClose,
}: {
  tone?: 'info' | 'error' | 'success' | 'warn'
  children: ReactNode
  onClose?: () => void
}) {
  const tones = {
    info: 'border-[var(--color-line)] bg-[var(--admin-soft)] text-[var(--color-ink-2)]',
    error: 'border-[#f0cfc0] bg-[#fdf3ee] text-[#b4460c]',
    success: 'border-[#cfe6d6] bg-[#f1f8f3] text-[#3f7f52]',
    warn: 'border-[#f0e0c8] bg-[#fdf8ef] text-[#a8611a]',
  }
  const icons = { info: <AlertIcon className="h-[15px] w-[15px]" />, error: <AlertIcon className="h-[15px] w-[15px]" />, success: <CheckIcon className="h-[15px] w-[15px]" />, warn: <AlertIcon className="h-[15px] w-[15px]" /> }
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={[
        'flex items-start gap-[9px] rounded-[10px] border px-[13px] py-[10px] font-cn text-[12px] leading-[1.65]',
        tones[tone],
      ].join(' ')}
    >
      <span className="mt-[1px] shrink-0">{icons[tone]}</span>
      <span className="flex-1">{children}</span>
      {onClose ? (
        <button type="button" onClick={onClose} aria-label="关闭提示" className="mt-[1px] shrink-0 opacity-60 hover:opacity-100">
          <XIcon className="h-[14px] w-[14px]" />
        </button>
      ) : null}
    </div>
  )
}

/* --------------------------------------------------------------------- 分区导航 */
/**
 * 分区导航的条目列表。
 *
 * 宽度由外层容器决定（`w-full`）。此前这里硬编 `w-[210px]`，于是它一旦被放进
 * 210px 的卡片里，条目就会比卡片内容区宽 24px、从右侧挤出去（实测溢出 13px）。
 */
export function SectionNav<T extends string>({
  items,
  active,
  onChange,
}: {
  items: readonly { key: T; label: string }[]
  active: T
  onChange: (key: T) => void
}) {
  return (
    <nav className="flex w-full flex-col gap-[4px]" aria-label="分区导航">
      {items.map((item) => {
        const on = item.key === active
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => onChange(item.key)}
            aria-current={on ? 'page' : undefined}
            className={[
              'flex h-[38px] items-center rounded-[9px] px-[12px] text-left font-cn text-[12.5px] transition-colors',
              on
                ? 'bg-[var(--color-primary-soft)] font-semibold text-[var(--color-primary)]'
                : 'text-[var(--color-ink-2)] hover:bg-[var(--admin-soft)]',
            ].join(' ')}
          >
            {item.label}
          </button>
        )
      })}
    </nav>
  )
}

/**
 * 分区导航白卡：210px 宽、圆角 16、内边距 12，条目因此是 186px 宽。
 *
 * 尺寸取自画布——站点设置 `13:1521`、账号设置 `13:1858`、账号安全 `13:1938`
 * 三屏的导航容器规格完全一致（210 / 12 / 圆角 16 / 条目间距 4 / 条目圆角 9 / 高 38）。
 * 描边沿用 `AdminCard`，本站所有卡片都带 1px 描边（画布无描边，属既有的统一取舍）。
 */
export function SectionNavCard<T extends string>({
  items,
  active,
  onChange,
}: {
  items: readonly { key: T; label: string }[]
  active: T
  onChange: (key: T) => void
}) {
  return (
    <div className="w-[210px] shrink-0 rounded-[16px] border border-[var(--color-line)] bg-[var(--admin-surface)] p-[12px]">
      <SectionNav items={items} active={active} onChange={onChange} />
    </div>
  )
}

/**
 * 横向模块页签（画布 `13:798`）。
 *
 * 与 `SectionNav` 的区别只在方向：那边是左侧纵向导航（站点设置、账号设置那几屏），
 * 这边是卡片内部的横向页签（首页内容屏的「首屏 / 关于我 / 技术栈 / 页脚」）。
 * 尺寸取自画布 `13:799`：内边距 13 / 7、圆角 8，选中态是主色浅底 + 主色字。
 */
export function TabRow<T extends string>({
  items,
  active,
  onChange,
  label = '模块',
}: {
  items: readonly { key: T; label: string }[]
  active: T
  onChange: (key: T) => void
  label?: string
}) {
  return (
    <div role="tablist" aria-label={label} className="flex flex-wrap items-center gap-[4px]">
      {items.map((item) => {
        const on = item.key === active
        return (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(item.key)}
            className={[
              'rounded-[8px] px-[13px] py-[7px] font-cn text-[12.5px] transition-colors',
              on
                ? 'bg-[var(--color-primary-soft)] font-medium text-[var(--color-primary)]'
                : 'text-[var(--color-ink-2)] hover:bg-[var(--admin-soft)]',
            ].join(' ')}
          >
            {item.label}
          </button>
        )
      })}
    </div>
  )
}

/* --------------------------------------------------------------------- 页面头 */
export function PageHeader({
  title,
  subtitle,
  right,
}: {
  title: string
  subtitle?: string
  right?: ReactNode
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-[16px]">
      <div className="flex flex-col gap-[6px]">
        <h1 className="font-cn text-[20px] font-bold leading-none text-[var(--color-ink)]">{title}</h1>
        {subtitle ? (
          <p className="font-cn text-[12.5px] leading-[1.6] text-[var(--color-ink-3)]">{subtitle}</p>
        ) : null}
      </div>
      {right ? <div className="flex items-center gap-[10px]">{right}</div> : null}
    </header>
  )
}

/** 页面右上角的次按钮：白底、胶囊、带图标。画布上「预览前台 / 查看站点 / 保留策略」都是这一款。 */
export function HeaderButton({
  icon,
  children,
  ...props
}: { icon?: ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className="inline-flex h-[34px] items-center gap-[7px] rounded-full border border-[var(--color-line)] bg-[var(--admin-surface)] px-[15px] font-cn text-[12.5px] font-medium text-[var(--color-ink-2)] transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:border-[var(--color-line)] disabled:hover:text-[var(--color-ink-2)]"
    >
      {icon}
      {children}
    </button>
  )
}

/* --------------------------------------------------------------------- 工具条 */
/** 筛选条外壳：白底卡片，左右两端分别放筛选与下拉。 */
export function Toolbar({ left, right }: { left?: ReactNode; right?: ReactNode }) {
  return (
    <section className="flex flex-wrap items-center gap-[8px] rounded-[14px] border border-[var(--color-line)] bg-[var(--admin-surface)] px-[16px] py-[11px]">
      {left}
      <span className="flex-1" />
      {right}
    </section>
  )
}

/** 圆形筛选胶囊。选中态用橙底橙字 —— 与画布的分区子导航同一套当前态语言。 */
export function Chip({
  active = false,
  onClick,
  children,
  title,
}: {
  active?: boolean
  onClick?: () => void
  children: ReactNode
  title?: string
}) {
  const interactive = Boolean(onClick)
  return (
    <button
      type="button"
      title={title}
      aria-pressed={interactive ? active : undefined}
      disabled={!interactive}
      onClick={onClick}
      className={[
        'inline-flex h-[30px] shrink-0 items-center gap-[6px] rounded-full px-[13px] font-cn text-[12.5px] leading-none transition-colors',
        active
          ? 'bg-[var(--color-primary-soft)] font-semibold text-[var(--color-primary)]'
          : 'border border-[var(--color-line)] bg-[var(--admin-surface)] font-normal text-[var(--color-ink-2)]',
        interactive && !active ? 'hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]' : '',
      ].join(' ')}
    >
      {children}
    </button>
  )
}

/** 胶囊里的计数：与文字同色但更淡，避免抢主标签的注意力。 */
export const ChipCount = ({ children }: { children: ReactNode }) => (
  <span className="font-latin opacity-60">{children}</span>
)

/**
 * 下拉选择。
 *
 * 用原生 `select` 而不是自绘：后台有 5 处下拉，自绘版要自己处理键盘、点击外部、
 * 滚动定位与移动端，收益只是一个能改样式的箭头。原生版的代价是无法改选项样式，
 * 这里没有需要样式化的选项。
 */
export function ControlSelect({
  value,
  onChange,
  options,
  ariaLabel,
  className = '',
}: {
  value: string
  onChange: (value: string) => void
  options: readonly { value: string; label: string }[]
  ariaLabel: string
  className?: string
}) {
  return (
    <div className={['relative shrink-0', className].join(' ')}>
      <select
        aria-label={ariaLabel}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-[30px] cursor-pointer appearance-none rounded-[9px] border border-[var(--color-line)] bg-[var(--admin-surface)] pl-[13px] pr-[30px] font-cn text-[12.5px] font-medium text-[var(--color-ink)] outline-none transition-colors hover:border-[var(--color-primary)] focus:border-[var(--color-primary)]"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDownIcon className="pointer-events-none absolute right-[11px] top-1/2 h-[13px] w-[13px] -translate-y-1/2 text-[var(--color-ink-3)]" />
    </div>
  )
}

/* --------------------------------------------------------------------- 开关 */
export function Switch({
  checked,
  onChange,
  disabled = false,
  label,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  disabled?: boolean
  label: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={[
        'inline-flex h-[20px] w-[34px] shrink-0 items-center rounded-full p-[2px] transition-colors',
        checked ? 'bg-[var(--color-primary)]' : 'bg-[#ded8cf]',
        disabled ? 'cursor-not-allowed opacity-55' : '',
      ].join(' ')}
    >
      <span
        className="block h-[16px] w-[16px] rounded-full bg-white shadow-[0_1px_2px_rgba(26,23,20,0.2)] transition-transform"
        style={{ transform: checked ? 'translateX(14px)' : 'translateX(0)' }}
      />
    </button>
  )
}

/** 设置页的开关行：浅底圆角块，左侧开关、中间标签、右侧补充说明。 */
export function SwitchRow({
  checked,
  onChange,
  label,
  hint,
  disabled = false,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  label: string
  hint?: string
  disabled?: boolean
}) {
  return (
    <div className="flex items-center gap-[12px] rounded-[12px] bg-[var(--admin-soft-strong)] px-[14px] py-[12px]">
      <Switch checked={checked} onChange={onChange} disabled={disabled} label={label} />
      <span className="flex-1 font-cn text-[12.5px] text-[var(--color-ink-2)]">{label}</span>
      {hint ? <span className="font-cn text-[11px] text-[var(--color-ink-3)]">{hint}</span> : null}
    </div>
  )
}

/* --------------------------------------------------------------------- 表格列 */
/**
 * 表头与数据行共用同一组列宽。
 *
 * 列宽写成显式数值而不是让浏览器自己算：表头与数据行是两棵独立的 DOM 子树，
 * 靠 `flex-1` 分配时，只要有一列内容不同就会错开（第一版在文章列表上就差点踩到）。
 */
export function Col({
  width,
  grow = false,
  right = false,
  className = '',
  children,
}: {
  width?: number
  grow?: boolean
  right?: boolean
  className?: string
  children?: ReactNode
}) {
  return (
    <span
      style={width ? { width } : undefined}
      className={[
        grow ? 'min-w-0 flex-1' : 'shrink-0',
        right ? 'text-right' : '',
        className,
      ].join(' ')}
    >
      {children}
    </span>
  )
}

export const Th = ({ children }: { children?: ReactNode }) => (
  <span className="font-cn text-[10.5px] font-medium leading-none text-[var(--color-ink-3)]">{children}</span>
)

/* --------------------------------------------------------------------- 空态 */
export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-[7px] px-[20px] py-[48px] text-center">
      <span className="font-cn text-[12.5px] text-[var(--color-ink-3)]">{title}</span>
      {hint ? <span className="font-cn text-[11px] leading-[1.7] text-[var(--admin-placeholder)]">{hint}</span> : null}
    </div>
  )
}

/** 加载中的占位行。用骨架而不是转圈：形状先出现，内容替换时不跳版。 */
export function SkeletonRows({ rows = 5, height = 44 }: { rows?: number; height?: number }) {
  return (
    <div className="flex flex-col" aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-[14px] px-[20px]" style={{ height }}>
          <span className="h-[13px] w-[38%] animate-pulse rounded-[6px] bg-[var(--admin-soft-strong)]" />
          <span className="h-[13px] w-[16%] animate-pulse rounded-[6px] bg-[var(--admin-soft-strong)]" />
          <span className="h-[13px] w-[22%] animate-pulse rounded-[6px] bg-[var(--admin-soft-strong)]" />
        </div>
      ))}
    </div>
  )
}

/* --------------------------------------------------------------------- 分页 */
export function Pager({
  page,
  totalPages,
  disabled = false,
  onChange,
}: {
  page: number
  totalPages: number
  disabled?: boolean
  onChange: (next: number) => void
}) {
  const btn = 'inline-flex h-[28px] w-[28px] items-center justify-center rounded-[8px] border border-[var(--color-line)] bg-[var(--admin-surface)] text-[var(--color-ink-2)] transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:border-[var(--color-line)] disabled:hover:text-[var(--color-ink-2)]'
  return (
    <div className="flex items-center gap-[6px]">
      <button
        type="button"
        aria-label="上一页"
        disabled={disabled || page <= 1}
        onClick={() => onChange(Math.max(page - 1, 1))}
        className={btn}
      >
        <ArrowLeftIcon className="h-[13px] w-[13px]" />
      </button>
      <span className="px-[2px] font-cn text-[12px] font-medium text-[var(--color-ink-3)]">
        {page} / {totalPages}
      </span>
      <button
        type="button"
        aria-label="下一页"
        disabled={disabled || page >= totalPages}
        onClick={() => onChange(Math.min(page + 1, totalPages))}
        className={btn}
      >
        <ArrowRightIcon className="h-[13px] w-[13px]" />
      </button>
    </div>
  )
}

/* --------------------------------------------------------------------- 行菜单 */
export interface RowAction {
  key: string
  label: string
  icon?: ReactNode
  onSelect?: () => void
  disabled?: boolean
  danger?: boolean
  title?: string
}

/**
 * 行内「更多」菜单。
 *
 * disabled 的菜单项**保留在菜单里并附上原因**，而不是直接删掉：
 * 一个「以后会有但现在按不动」的入口，比一个凭空消失的入口更容易解释。
 *
 * `size` 只有两种：`sm` 是列表行里那个 24px 的图标按钮，`md` 是顶栏里 34px 的圆形按钮。
 * 两者是同一套菜单，只是触发器的分量不同（顶栏的那枚要跟旁边的胶囊按钮等高）。
 */
export function RowMenu({
  actions,
  label,
  size = 'sm',
}: {
  actions: readonly RowAction[]
  label: string
  size?: 'sm' | 'md'
}) {
  const [open, setOpen] = useState(false)
  const boxRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    const onDocClick = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={[
          'inline-flex items-center justify-center text-[var(--color-ink-3)] transition-colors hover:bg-[var(--admin-soft)] hover:text-[var(--color-ink)]',
          size === 'md'
            ? 'h-[34px] w-[34px] rounded-full border border-[var(--color-line)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]'
            : 'h-[24px] w-[24px] rounded-[7px]',
        ].join(' ')}
      >
        <MoreIcon className={size === 'md' ? 'h-[16px] w-[16px]' : 'h-[15px] w-[15px]'} />
      </button>

      {open ? (
        <div
          role="menu"
          className={[
            'absolute right-0 z-20 w-[168px] overflow-hidden rounded-[10px] border border-[var(--color-line)] bg-[var(--admin-surface)] py-[4px] shadow-[0_10px_28px_-12px_rgba(26,23,20,0.28)]',
            size === 'md' ? 'top-[38px]' : 'top-[26px]',
          ].join(' ')}
        >
          {actions.map((a) => (
            <button
              key={a.key}
              type="button"
              role="menuitem"
              disabled={a.disabled}
              title={a.title}
              onClick={() => {
                setOpen(false)
                a.onSelect?.()
              }}
              className={[
                'flex w-full items-center gap-[9px] px-[12px] py-[8px] text-left font-cn text-[12.5px] transition-colors',
                a.disabled
                  ? 'cursor-not-allowed text-[var(--admin-placeholder)]'
                  : a.danger
                    ? 'text-[#b4460c] hover:bg-[#fdf3ee]'
                    : 'text-[var(--color-ink-2)] hover:bg-[var(--admin-soft)]',
              ].join(' ')}
            >
              {a.icon}
              {a.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

/* --------------------------------------------------------------------- 弹层 */
/**
 * 弹层挂在 body 上（portal），不留在原位置。
 * 后台多数页面把内容放在 `overflow-hidden` 的卡片里，就地渲染会被裁掉；
 * 而 `position: fixed` 一旦遇到带 `transform` 的祖先同样会失效。
 */
export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  width = 460,
}: {
  open: boolean
  onClose: () => void
  title: string
  subtitle?: string
  children: ReactNode
  footer?: ReactNode
  width?: number
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-[24px]">
      <div
        className="absolute inset-0 bg-[rgba(26,23,20,0.42)]"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={{ width }}
        className="relative flex max-h-full flex-col overflow-hidden rounded-[16px] border border-[var(--color-line)] bg-[var(--admin-surface)] shadow-[0_36px_90px_-40px_rgba(26,23,20,0.55)]"
      >
        <header className="flex items-start justify-between gap-[16px] px-[22px] py-[18px]">
          <div className="flex flex-col gap-[5px]">
            <h2 className="font-cn text-[14px] font-semibold leading-none text-[var(--color-ink)]">{title}</h2>
            {subtitle ? (
              <p className="font-cn text-[11.5px] leading-[1.6] text-[var(--color-ink-3)]">{subtitle}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="-mr-[4px] -mt-[2px] inline-flex h-[24px] w-[24px] shrink-0 items-center justify-center rounded-[7px] text-[var(--color-ink-3)] transition-colors hover:bg-[var(--admin-soft)] hover:text-[var(--color-ink)]"
          >
            <XIcon className="h-[14px] w-[14px]" />
          </button>
        </header>
        <div className="h-px bg-[var(--color-line)]" />
        <div className="flex-1 overflow-y-auto px-[22px] py-[20px]">{children}</div>
        {footer ? (
          <>
            <div className="h-px bg-[var(--color-line)]" />
            <footer className="flex items-center justify-between gap-[12px] px-[22px] py-[14px]">
              {footer}
            </footer>
          </>
        ) : null}
      </div>
    </div>,
    document.body
  )
}

/**
 * 确认弹层。
 *
 * 替代 `window.confirm`：原生 confirm 无法表达「这个操作不可撤销」的层级差别，
 * 也不能禁用按钮、显示忙碌态，点了之后整个页面卡住。
 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = '确认',
  cancelLabel = '取消',
  tone = 'default',
  busy = false,
  confirmDisabled = false,
  onConfirm,
  onCancel,
}: {
  open: boolean
  title: string
  message: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  tone?: 'default' | 'danger'
  busy?: boolean
  /**
   * 确认键置灰。
   *
   * 与 `busy` 分开：`busy` 是「正在跑」，这里表达的是「按下去也不会有任何改动」——
   * 批量操作里一批选中项可能全部不符合条件，那时候让人点下去收到一句
   * 「没有任何改动」，不如在摆着原因的这一层就停住。
   */
  confirmDisabled?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <Modal
      open={open}
      onClose={busy ? () => undefined : onCancel}
      title={title}
      width={420}
      footer={
        <>
          <span />
          <div className="flex items-center gap-[10px]">
            <Button variant="outline" size="sm" onClick={onCancel} disabled={busy}>
              {cancelLabel}
            </Button>
            <Button
              variant={tone === 'danger' ? 'danger' : 'primary'}
              size="sm"
              loading={busy}
              disabled={confirmDisabled}
              onClick={onConfirm}
            >
              {confirmLabel}
            </Button>
          </div>
        </>
      }
    >
      <p className="font-cn text-[12.5px] leading-[1.8] text-[var(--color-ink-2)]">{message}</p>
    </Modal>
  )
}

/* --------------------------------------------------------------------- 多选 */

/**
 * 复选框。
 *
 * 用原生 `input[type=checkbox]` + `appearance-none` 自绘外观，而不是手写一个
 * `div` 加 `role="checkbox"`：键盘（空格切换）、`indeterminate`（全选时的第三种状态）、
 * 表单语义都由浏览器给。手写版要把这三样一条条补回来，而它们恰恰是最容易漏的 ——
 * 漏掉 `indeterminate` 的后果是「全选」在两个状态之间没有中间态可看。
 *
 * `indeterminate` **没有对应的 HTML attribute**，只能通过 DOM 属性写，所以这里
 * 用一个 ref 在渲染后回写 —— 别指望它能从 props 一路传到 `<input>` 上。
 *
 * 勾与横杠画在 input 之上（绝对定位的 input 会盖住同层的普通元素，所以那两个
 * 图形自己也得是定位元素）。勾复用公共图标，横杠就地画一条 —— 图标库里没有它。
 */
export function Checkbox({
  checked,
  indeterminate = false,
  disabled = false,
  label,
  onChange,
  className = '',
}: {
  checked: boolean
  indeterminate?: boolean
  disabled?: boolean
  /** 无障碍名。列表里的复选框没有可见文字，这一项不能省 */
  label: string
  onChange: (checked: boolean) => void
  className?: string
}) {
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate && !checked
  }, [indeterminate, checked])

  const on = checked || indeterminate
  return (
    <span className={['relative inline-flex h-[16px] w-[16px] shrink-0', className].join(' ')}>
      <input
        ref={ref}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        aria-label={label}
        onChange={(e) => onChange(e.target.checked)}
        className={[
          'absolute inset-0 h-[16px] w-[16px] appearance-none rounded-[5px] border bg-[var(--admin-surface)] transition-colors',
          disabled ? 'cursor-not-allowed border-[#ded7ce]' : 'cursor-pointer border-[#cfc7bd]',
          'checked:border-[var(--color-primary)] checked:bg-[var(--color-primary)]',
          'indeterminate:border-[var(--color-primary)] indeterminate:bg-[var(--color-primary)]',
          'hover:border-[var(--color-primary)]',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary-soft)]',
        ].join(' ')}
      />
      {on ? (
        <span className="pointer-events-none relative flex h-[16px] w-[16px] items-center justify-center text-white">
          {indeterminate && !checked ? (
            <svg viewBox="0 0 12 12" className="relative h-[10px] w-[10px]" aria-hidden="true">
              <path d="M2.6 6h6.8" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
            </svg>
          ) : (
            /* 24 视口的描边图标缩到 10px，默认 1.6 的线宽只有 0.67px —— 加粗到 4 才看得见 */
            <CheckIcon className="relative h-[10px] w-[10px]" strokeWidth={4} />
          )}
        </span>
      ) : null}
    </span>
  )
}

/**
 * 批量操作条。
 *
 * 位置在**筛选条与列表之间**，而不是盖掉筛选条：筛选条要继续可见 —— 你得知道
 * 自己是在哪个筛选下选的这几项；而动作条要紧贴它所作用的那批行。
 *
 * 文案里的条数由调用方传进来（`{n}` 占位），不在这一层拼 —— 三个屏对「项 / 篇 / 个」
 * 的量词不同，而量词属于各自屏的文案。
 */
export function SelectionBar({
  count,
  label,
  clearLabel,
  actions,
  hint,
  lead,
  onClear,
}: {
  count: number
  /** 带 `{n}` 的句式 */
  label: string
  clearLabel: string
  /** 「移入回收站 / 彻底删除」这些按钮 */
  actions: ReactNode
  /**
   * 对那个数字的解释。条数是**使用者看得见的唯一凭据**，但「当前筛选下全部 42 篇」
   * 与「本页 8 篇」是两件完全不同的事 —— 这一行就是用来消除这个歧义的。
   */
  hint?: ReactNode
  /** 范围切换：「选中符合当前筛选的全部 N 条」 */
  lead?: ReactNode
  onClear: () => void
}) {
  const title = label.replace('{n}', String(count))
  return (
    <section
      className="flex flex-wrap items-center gap-[8px] rounded-[14px] border border-[var(--color-primary)] bg-[var(--color-primary-soft)] px-[16px] py-[10px]"
      role="region"
      aria-label={title}
    >
      <span className="font-cn text-[12.5px] font-semibold leading-none text-[var(--color-primary)]">{title}</span>
      {hint ? (
        <span className="font-cn text-[11.5px] leading-none text-[var(--color-primary)] opacity-80">{hint}</span>
      ) : null}
      <span className="h-[14px] w-px bg-[var(--color-primary)] opacity-30" aria-hidden="true" />
      {lead}
      {actions}
      <span className="flex-1" />
      <button
        type="button"
        onClick={onClear}
        className="font-cn text-[12px] leading-none text-[var(--color-primary)] underline-offset-2 hover:underline"
      >
        {clearLabel}
      </button>
    </section>
  )
}

/**
 * 多选，两种范围。**界面上的每一句话和交给接口的那段范围都由它产出，三屏共用。**
 *
 *   page —— 显式勾选当前页这几条，请求体是 `ids`
 *   all  —— 「选中符合当前筛选的全部 N 条」，请求体是 `filter` + `exclude`
 *
 * `ids` 与 `filter` 二选一，不能两个都给（服务端会 400）。这个互斥**不需要界面的
 * 纪律来保证**：`scope()` 一次只可能吐出其中一种形状，按错按钮这件事在类型上不成立。
 *
 * 为什么 all 模式不把几万个 id 拉下来传回去 —— `ids` 传的是**数据的副本**，
 * 而副本会过期：从勾上到提交之间可能有别处写入（另一台设备发了文章、清理定时器删了几条）。
 * `filter` 传的是**意图**，服务端按意图现取集合，取的就是那一刻的真实情况。
 * `exclude` 用来表达「全部，除了这几条」——「全选之后反选」只有这一种说法。
 *
 * `expected` 是界面当时显示的那个数：服务端算出来的集合若与它对不上就拒绝执行（409）。
 * 免得在一次「列表已经变了」的事实上，照着旧名单把别的条目删掉。
 */
export function useSelection({
  pageIds,
  total,
  filter,
}: {
  /** 当前页可见行的 id，顺序即界面顺序 */
  pageIds: readonly number[]
  /** 当前筛选下的总条数（不是本页条数） */
  total: number
  /** 当前筛选条件，原样交给服务端 */
  filter: Record<string, string>
}) {
  const [picked, setPicked] = useState<number[]>([])
  /** all 模式下被手动反选的那几条 */
  const [dropped, setDropped] = useState<number[]>([])
  const [allMode, setAllMode] = useState(false)

  /* 依赖用 join 出来的串而不是 ids 数组本身：调用方传的多半是
     `pageItems.map(...)` 这种每次渲染都新建的数组，依赖它等于每帧重算一遍。 */
  const idKey = pageIds.join(',')
  const filterKey = JSON.stringify(filter)

  const page = useMemo(() => new Set(pageIds), [idKey])
  const pickedSet = useMemo(() => new Set(picked), [picked.join(',')])
  const droppedSet = useMemo(() => new Set(dropped), [dropped.join(',')])

  /*
   * 列表一换代（翻页 / 切筛选 / 改排序 / 增删之后重取）就回到「一条都没选」。
   * 判据是这个 key，而不是「记得在 useEffect 里 clear()」—— 那种约定漏一处
   * 就是一个跨页提交；这里漏不掉，因为换代这件事本身就写在依赖里。
   */
  useEffect(() => {
    setPicked([])
    setDropped([])
    setAllMode(false)
  }, [idKey, filterKey])

  const pageSelected = picked.filter((id) => page.has(id))
  const count = allMode ? Math.max(total - dropped.length, 0) : pageSelected.length

  return {
    mode: allMode ? ('all' as const) : ('page' as const),
    /** 界面上「选中了 N 条」的那个 N */
    count,
    has: (id: number) => (allMode ? !droppedSet.has(id) : pickedSet.has(id)),
    allSelected: pageIds.length > 0 && (allMode ? dropped.length === 0 : pageSelected.length === pageIds.length),
    /** 表头那个复选框的第三种状态：选了一部分 */
    partial: count > 0 && pageIds.length > 0 && !(allMode ? dropped.length === 0 : pageSelected.length === pageIds.length),
    toggle: (id: number, on: boolean) => {
      if (allMode) {
        setDropped((prev) => (on ? prev.filter((x) => x !== id) : prev.includes(id) ? prev : [...prev, id]))
      } else {
        setPicked((prev) => (on ? (prev.includes(id) ? prev : [...prev, id]) : prev.filter((x) => x !== id)))
      }
    },
    /** 表头复选框：全选 / 取消本页。all 模式下点它是退出全范围。 */
    toggleAll: () => {
      if (allMode) {
        setAllMode(false)
        setDropped([])
        setPicked([])
        return
      }
      setPicked(pageSelected.length === pageIds.length ? [] : [...pageIds])
    },
    selectAllFiltered: () => {
      setAllMode(true)
      setDropped([])
    },
    clear: () => {
      setPicked([])
      setDropped([])
      setAllMode(false)
    },
    /** 交给接口的选中范围。两种形状互斥，见上面的说明。 */
    scope: () =>
      allMode
        ? { filter, exclude: dropped, expected: count }
        : { ids: pageSelected },
  }
}
