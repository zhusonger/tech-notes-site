import { useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { useSiteContent } from '../data/SiteContent'
import { Footer } from './Footer'
import { Header } from './Header'

/** 路由切换时回到顶部；带锚点时滚动到对应区块 */
function ScrollManager() {
  const { pathname, hash } = useLocation()

  useEffect(() => {
    if (hash) {
      /*
       * 锚点可能是中文（正文标题直接生成的 id），所以：
       *   1. 用 `getElementById` 而不是 `querySelector('#…')` —— 后者遇到需要转义的
       *      字符会直接抛错；
       *   2. 先 `decodeURIComponent` —— 从地址栏粘贴过来的锚点是百分号编码的。
       */
      const target = document.getElementById(decodeURIComponent(hash.slice(1)))
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' })
        return
      }
    }
    window.scrollTo({ top: 0 })
  }, [pathname, hash])

  return null
}

/**
 * 内容降级提示。
 *
 * 只在**取内容失败**时出现，刚打开页面那一瞬间（还没取完）不出现 ——
 * 否则每次刷新都会闪一下，久了就没人看它了。
 * 提示里必须说清「现在看到的不是线上内容」，否则作者会以为后台改了没生效。
 */
function ContentFallbackNotice({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="border-b border-[var(--color-line)] bg-[#FFF6E9] px-6 py-[9px] text-center font-cn text-[12.5px] leading-relaxed text-[var(--color-ink-2)]">
      内容服务暂时不可用，当前显示的是最近一次构建时收录的内容。
      <button
        type="button"
        onClick={onRetry}
        className="ml-[10px] text-[var(--color-primary)] underline underline-offset-2"
      >
        重试
      </button>
    </div>
  )
}

export function Layout() {
  const { source, reload } = useSiteContent()

  return (
    <div className="flex min-h-full flex-col bg-[var(--color-bg)]">
      <ScrollManager />
      {source === 'fallback' ? <ContentFallbackNotice onRetry={reload} /> : null}
      <Header />
      <main className="flex-1">
        <Outlet />
      </main>
      <Footer />
    </div>
  )
}
