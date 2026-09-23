/**
 * 站点内容上下文 —— 前台读取后台数据的入口。
 *
 * 分工：
 *   - `content`：页面直接渲染的内容。接口没回来之前就是兜底内容（首屏不留白）；
 *   - `source`：内容**从哪来**。`fallback` 表示接口不可用、当前显示的不是线上内容，
 *     这时页面上会出现一条明确提示 —— 静默降级会让人以为「后台改了不生效」，
 *     那种误判比报错更难查。
 *
 * 没有 Provider 时（服务端渲染校验、组件单测）取默认值：内容为兜底、source 为
 * `loading`。因此组件在无网络环境下也能确定性地渲染出内容。
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { DEFAULT_CONTENT, fallbackArticle, type PostDetail, type SiteContent } from './site'

export type ContentSource = 'loading' | 'live' | 'fallback'

interface SiteContentValue {
  content: SiteContent
  source: ContentSource
  reload: () => void
}

const SiteContentContext = createContext<SiteContentValue>({
  content: DEFAULT_CONTENT,
  source: 'loading',
  reload: () => {},
})

export function SiteContentProvider({ children }: { children: ReactNode }) {
  const [content, setContent] = useState<SiteContent>(DEFAULT_CONTENT)
  const [source, setSource] = useState<ContentSource>('loading')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let alive = true

    fetch('/api/content', { headers: { accept: 'application/json' } })
      .then((res) => {
        if (!res.ok) throw new Error(`内容接口返回 ${res.status}`)
        return res.json() as Promise<SiteContent>
      })
      .then((data) => {
        if (!alive) return
        setContent(data)
        setSource('live')
      })
      .catch(() => {
        if (alive) setSource('fallback')
      })

    return () => {
      alive = false
    }
  }, [attempt])

  const reload = useCallback(() => setAttempt((n) => n + 1), [])
  const value = useMemo(() => ({ content, source, reload }), [content, source, reload])

  return <SiteContentContext.Provider value={value}>{children}</SiteContentContext.Provider>
}

export function useSiteContent() {
  return useContext(SiteContentContext)
}

/**
 * 文章详情。三种「没有正文可显示」必须区分开，否则会互相冒充：
 *   - `loading` 还在取；
 *   - `missing` 服务端明确说没有（未发布 / 从未存在）—— 这才是 404；
 *   - `error`   取不到（网络或服务端故障），且兜底里也没有这篇
 *               —— 说成「不存在」是假话，只能说「暂时取不到」。
 */
export type ArticleStatus = 'loading' | 'ok' | 'missing' | 'error'

export function useArticle(slug: string | undefined) {
  const fallback = useMemo(() => (slug ? fallbackArticle(slug) : null), [slug])
  const [live, setLive] = useState<PostDetail | null>(null)
  const [status, setStatus] = useState<ArticleStatus>('loading')

  useEffect(() => {
    if (!slug) {
      setStatus('missing')
      return
    }

    let alive = true
    setLive(null)
    setStatus('loading')

    fetch(`/api/content/posts/${encodeURIComponent(slug)}`, {
      headers: { accept: 'application/json' },
    })
      .then(async (res) => {
        if (res.status === 404) {
          if (alive) setStatus('missing')
          return null
        }
        if (!res.ok) throw new Error(`文章接口返回 ${res.status}`)
        return (await res.json()) as PostDetail
      })
      .then((data) => {
        if (!alive || !data) return
        setLive(data)
        setStatus('ok')
      })
      .catch(() => {
        if (!alive) return
        // 拿不到线上内容时退到兜底：兜底里有这篇就照常显示，没有才如实报错
        setStatus(fallback ? 'ok' : 'error')
      })

    return () => {
      alive = false
    }
  }, [slug, fallback])

  return { post: live ?? fallback, status: live ? ('ok' as const) : status }
}
