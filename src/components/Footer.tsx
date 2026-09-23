import { Link } from 'react-router-dom'
import { useSiteContent } from '../data/SiteContent'
import { footerBottomLinks, footerLinkGroups } from '../data/site'
import { LogoMark } from './Icons'

/** 站外链接（http(s)）与邮件链接直接跳转，不走 SPA 路由 */
const isExternal = (to: string) => /^(https?:\/\/|mailto:)/.test(to)

export function Footer() {
  const { content } = useSiteContent()
  const { site } = content

  /*
   * 「联系」这一组由站点内容实时拼出，不写进常量：
   * 写死就会出现「站点设置改了邮箱 / GitHub，页脚还是旧的」。
   */
  const groups = [
    ...footerLinkGroups,
    {
      label: '联系',
      links: [
        { label: site.github, to: `https://${site.github}` },
        { label: site.email, to: `mailto:${site.email}` },
      ].filter((link) => link.label),
    },
  ]

  return (
    <footer id="contact" className="bg-[var(--color-footer-bg)]">
      <div className="mx-auto w-full max-w-[var(--content-width)] px-6 py-16 md:px-10 lg:px-16">
        <p className="font-cn text-[22px] font-bold leading-[1.5] text-[var(--color-footer-ink)] md:text-[26px]">
          {site.footerQuote}
        </p>

        <div className="mt-12 flex flex-col gap-10 lg:flex-row lg:items-start lg:justify-between lg:gap-16">
          <div className="flex w-full max-w-[400px] shrink-0 flex-col gap-[14px]">
            <div className="flex items-center gap-[10px]">
              <LogoMark className="h-[32px] w-[32px]" />
              <span className="font-cn text-[15px] font-bold leading-none text-[var(--color-footer-ink)]">
                {site.brand}
              </span>
            </div>
            <p className="font-cn text-[13px] leading-[1.8] text-[var(--color-footer-ink-2)]">
              {site.footerNote}
            </p>
          </div>

          <div className="flex flex-wrap gap-x-16 gap-y-10">
            {groups.map((group) => (
              <div key={group.label} className="flex min-w-[120px] flex-col gap-[14px]">
                <span className="font-cn text-[12px] leading-none text-[var(--color-footer-ink-2)]">
                  {group.label}
                </span>
                <ul className="flex flex-col gap-[12px]">
                  {group.links.map((link) => {
                    const linkClass =
                      'font-cn text-[14px] leading-none text-[var(--color-footer-ink)] transition-opacity hover:opacity-70'
                    return (
                      <li key={`${group.label}-${link.label}`}>
                        {isExternal(link.to) ? (
                          <a
                            href={link.to}
                            target={link.to.startsWith('mailto:') ? undefined : '_blank'}
                            rel="noreferrer"
                            className={linkClass}
                          >
                            {link.label}
                          </a>
                        ) : (
                          <Link to={link.to} className={linkClass}>
                            {link.label}
                          </Link>
                        )}
                      </li>
                    )
                  })}
                </ul>
              </div>
            ))}
          </div>

          <a
            href={`mailto:${site.email}`}
            className="inline-flex h-[46px] w-fit shrink-0 items-center rounded-full border border-[#3B352F] px-[22px] font-cn text-[14px] font-medium leading-none text-[var(--color-footer-ink)] transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
          >
            与我联系
          </a>
        </div>

        <div className="mt-12 h-px w-full bg-[#2C2722]" />

        <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <span className="font-cn text-[12px] leading-none text-[var(--color-footer-ink-2)]">
            {site.copyright}
          </span>
          <div className="flex flex-wrap items-center gap-x-[24px] gap-y-3">
            {footerBottomLinks.map((link) => (
              <Link
                key={link.label}
                to={link.to}
                className="font-cn text-[12px] leading-none text-[var(--color-footer-ink-2)] transition-colors hover:text-[var(--color-footer-ink)]"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </footer>
  )
}
