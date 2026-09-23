import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRightIcon } from './Icons'

type Variant = 'primary' | 'outline'

interface ButtonLinkProps {
  to: string
  children: ReactNode
  variant?: Variant
  icon?: ReactNode
}

const base =
  'inline-flex items-center justify-center gap-[8px] rounded-full px-[22px] h-[46px] text-[14px] font-medium transition-colors'

const variants: Record<Variant, string> = {
  primary:
    'bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-deep)]',
  outline:
    'bg-[var(--color-bg)] text-[var(--color-ink)] border border-[var(--color-line)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]',
}

export function ButtonLink({ to, children, variant = 'primary', icon }: ButtonLinkProps) {
  return (
    <Link to={to} className={[base, variants[variant]].join(' ')}>
      {children}
      {icon ?? null}
    </Link>
  )
}

interface ButtonActionProps {
  children: ReactNode
  variant?: Variant
  onClick?: () => void
  icon?: ReactNode
}

export function ButtonAction({
  children,
  variant = 'primary',
  onClick,
  icon,
}: ButtonActionProps) {
  return (
    <button type="button" onClick={onClick} className={[base, variants[variant]].join(' ')}>
      {icon ?? null}
      {children}
    </button>
  )
}

interface TextLinkProps {
  to: string
  children: ReactNode
}

export function TextLink({ to, children }: TextLinkProps) {
  return (
    <Link
      to={to}
      className="group inline-flex items-center gap-[6px] text-[14px] font-medium text-[var(--color-primary)] transition-opacity hover:opacity-80"
    >
      {children}
      <ArrowRightIcon className="h-[16px] w-[16px] transition-transform group-hover:translate-x-[2px]" />
    </Link>
  )
}
