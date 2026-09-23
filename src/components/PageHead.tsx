interface PageHeadProps {
  eyebrow: string
  title: string
  description: string
  stats: string
}

export function PageHead({ eyebrow, title, description, stats }: PageHeadProps) {
  return (
    <section className="border-b border-[var(--color-line)] bg-[var(--color-bg-warm)]">
      <div className="mx-auto w-full max-w-[var(--content-width)] px-6 py-14 md:px-10 md:py-16 lg:px-16">
        <span className="inline-flex items-center gap-[8px] rounded-full border border-[var(--color-line)] bg-[var(--color-bg)] px-[14px] py-[7px] text-[13px] leading-none text-[var(--color-primary)]">
          <span className="block h-[6px] w-[6px] rounded-full bg-[var(--color-primary)]" />
          {eyebrow}
        </span>
        <h1 className="mt-6 font-cn text-[34px] font-bold leading-[1.2] text-[var(--color-ink)] md:text-[44px]">
          {title}
        </h1>
        <p className="mt-4 max-w-[620px] font-cn text-[16px] leading-[1.8] text-[var(--color-ink-2)]">
          {description}
        </p>
        <p className="mt-6 font-latin text-[13px] leading-none text-[var(--color-ink-3)]">
          {stats}
        </p>
      </div>
    </section>
  )
}
