import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useSiteContent } from '../data/SiteContent'
import { navItems } from '../data/site'
import { LogoMark, SearchIcon } from './Icons'

export function Header() {
  const navigate = useNavigate()
  const { content } = useSiteContent()
  const { site } = content
  const [query, setQuery] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)

  const handleSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const trimmed = query.trim()
    navigate(trimmed ? `/blog?q=${encodeURIComponent(trimmed)}` : '/blog')
    setMenuOpen(false)
  }

  return (
    <header className="sticky top-0 z-50 border-b border-[var(--color-line)] bg-[var(--color-bg-warm)]/95 backdrop-blur">
      <div className="mx-auto flex h-[76px] w-full max-w-[var(--content-width)] items-center justify-between gap-6 px-6 md:px-10 lg:px-16">
        <Link to="/" className="flex shrink-0 items-center gap-[10px]">
          <LogoMark className="h-[34px] w-[34px]" />
          <span className="flex flex-col gap-[3px]">
            <span className="font-cn text-[15px] font-bold leading-none text-[var(--color-ink)]">
              {site.brand}
            </span>
            <span className="font-cn text-[12px] leading-none text-[var(--color-ink-3)]">
              {site.tagline}
            </span>
          </span>
        </Link>

        <nav className="hidden items-center gap-[28px] lg:flex">
          {navItems.map((item) => (
            /* 顶部导航不做「当前页高亮」：所有 tab 统一色，仅 hover 变主色 */
            <Link
              key={item.label}
              to={item.to}
              className="font-cn text-[14px] leading-none text-[var(--color-ink-2)] transition-colors hover:text-[var(--color-primary)]"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-[12px]">
          <form
            onSubmit={handleSearch}
            className="hidden h-[38px] items-center gap-[8px] rounded-full border border-[var(--color-line)] bg-[var(--color-bg)] px-[14px] xl:flex"
          >
            <SearchIcon className="h-[16px] w-[16px] text-[var(--color-ink-3)]" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索文章…"
              aria-label="搜索文章"
              className="w-[150px] bg-transparent font-cn text-[13px] text-[var(--color-ink)] outline-none placeholder:text-[var(--color-ink-3)]"
            />
          </form>

          <a
            href={`mailto:${site.email}`}
            className="hidden h-[40px] items-center rounded-full bg-[var(--color-primary)] px-[20px] font-cn text-[14px] font-medium leading-none text-white transition-colors hover:bg-[var(--color-primary-deep)] sm:inline-flex"
          >
            与我联系
          </a>

          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-label="展开导航"
            aria-expanded={menuOpen}
            className="flex h-[38px] w-[38px] items-center justify-center rounded-full border border-[var(--color-line)] bg-[var(--color-bg)] text-[var(--color-ink-2)] lg:hidden"
          >
            <span className="flex flex-col gap-[4px]">
              <span className="block h-[1.5px] w-[16px] bg-current" />
              <span className="block h-[1.5px] w-[16px] bg-current" />
              <span className="block h-[1.5px] w-[16px] bg-current" />
            </span>
          </button>
        </div>
      </div>

      {menuOpen ? (
        <div className="border-t border-[var(--color-line)] bg-[var(--color-bg)] lg:hidden">
          <nav className="mx-auto flex w-full max-w-[var(--content-width)] flex-col px-6 py-3 md:px-10">
            {navItems.map((item) => (
              <Link
                key={item.label}
                to={item.to}
                onClick={() => setMenuOpen(false)}
                className="border-b border-[var(--color-line-soft)] py-[14px] font-cn text-[15px] text-[var(--color-ink-2)] last:border-b-0"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      ) : null}
    </header>
  )
}
