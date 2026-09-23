/**
 * 后台外壳要显示的站点名称。
 *
 * 站点名称是**可编辑的站点设置**，与前台同一份来源。写死在组件里就会出现
 * 「前台改了名、后台侧边栏还挂着旧的」—— 这类不一致不会报错，只能靠肉眼发现。
 *
 * 拉的是 `/api/content/site`（只有一个字段），不是 `/api/content`
 * （含全部文章正文与区块文档）—— 外壳每次渲染都要这几个字，不值得为它下载几十 KB。
 *
 * 取不到时保持中性默认值：站点标识拉不到，不该让登录页或侧边栏空一块。
 */
import { useEffect, useState } from 'react'
import { adminBrand } from '../data/admin'

export interface SiteBrand {
  /** 站点名称 */
  name: string
  /** 方形字标：取站点名首字 */
  monogram: string
}

/**
 * 取站点名首字符做字标。
 *
 * 用 `Array.from` 而不是 `name[0]`：站点名首字若是 emoji 或罕用汉字（代理对），
 * 下标取值会切出半个字符，渲染成一个方框。
 */
function monogramOf(name: string): string {
  return Array.from(name)[0] ?? adminBrand.monogram
}

export function useSiteBrand(): SiteBrand {
  const [site, setSite] = useState<SiteBrand>({
    name: adminBrand.name,
    monogram: adminBrand.monogram,
  })

  useEffect(() => {
    const ac = new AbortController()
    fetch('/api/content/site', { signal: ac.signal, headers: { accept: 'application/json' } })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { brand?: unknown } | null) => {
        const name = typeof data?.brand === 'string' ? data.brand.trim() : ''
        if (!name) return
        setSite({ name, monogram: monogramOf(name) })
      })
      .catch(() => {
        /* 拉不到就保持默认值：站点标识不该阻塞后台渲染 */
      })
    return () => ac.abort()
  }, [])

  return site
}
