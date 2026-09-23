import type { ReactNode } from 'react'

interface ContainerProps {
  children: ReactNode
  className?: string
  /** 内容区收窄，用于文章正文等阅读场景 */
  narrow?: boolean
}

export function Container({ children, className = '', narrow = false }: ContainerProps) {
  return (
    <div
      className={[
        'mx-auto w-full px-6 md:px-10 lg:px-16',
        narrow ? 'max-w-[880px]' : 'max-w-[var(--content-width)]',
        className,
      ].join(' ')}
    >
      {children}
    </div>
  )
}
