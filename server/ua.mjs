/**
 * 轻量 User-Agent 解析：只回答「什么设备 / 什么系统 / 什么浏览器」三个问题。
 *
 * 为什么不上 ua-parser-js：后台访客列表要的是「手机还是电脑、什么系统」这一档粗粒度，
 * 不需要完整设备型号库；而 ua-parser-js 的规则库体积（含正则集合）远大于本文件，
 * 且它每月都需要跟着 UA 变化升级。这里的判断是**从宽**的：
 * 认不出来就老实标「未知」，不猜。
 *
 * 顺序是这套代码里唯一要紧的事，写错就会得出荒谬结论：
 *   - 爬虫要先判，否则 Googlebot 会被当成 Chrome；
 *   - Edge 的 UA 里含 `Chrome`，Chrome 的 UA 里含 `Safari`，必须由特殊到一般；
 *   - Android 的 UA 里含 `Linux`，iOS 的桌面模式上报 `Macintosh`，
 *     所以系统判断要先看移动端关键字再看桌面关键字。
 */

const BOT_RE = /bot|crawler|spider|slurp|bingpreview|headlesschrome|phantomjs|curl\/|wget|python-requests|python-urllib|axios\/|node-fetch|go-http-client|okhttp|java\/|postmanruntime/i

/** 返回 `{ kind, os, browser, label }`；kind ∈ mobile | tablet | desktop | bot | unknown */
export function deviceOf(ua) {
  const s = String(ua ?? '').trim()
  if (!s) return { kind: 'unknown', os: '', browser: '', label: '未知' }

  if (BOT_RE.test(s)) return { kind: 'bot', os: '', browser: '', label: '爬虫 / 机器人' }

  const os = detectOs(s)
  const browser = detectBrowser(s)
  const kind = detectKind(s)

  const label = [browser, os].filter(Boolean).join(' · ') || '未知'
  return { kind, os, browser, label }
}

function detectKind(s) {
  // iPad 从 iPadOS 13 起默认上报桌面版 Safari（含 Macintosh），要靠 Mobile 关键字与机型名区分
  if (/iPad/i.test(s)) return 'tablet'
  if (/Android/i.test(s) && !/Mobile/i.test(s)) return 'tablet'
  // 真机 macOS Safari 的 UA 里不带 Mobile，带 Mobile 的 Macintosh 实际是 iPad
  if (/Macintosh/i.test(s) && /Mobile/i.test(s)) return 'tablet'
  if (/iPhone|iPod|Android|Mobile|Windows Phone|HarmonyOS/i.test(s)) return 'mobile'
  return 'desktop'
}

function detectOs(s) {
  // 先移动端，再桌面 —— 顺序反了 Android 会被 Linux 抢走、iPadOS 会被 macOS 抢走
  if (/HarmonyOS|OpenHarmony/i.test(s)) return 'HarmonyOS'
  if (/iPhone|iPad|iPod/i.test(s)) return 'iOS'
  if (/Android/i.test(s)) return 'Android'
  if (/Windows Phone/i.test(s)) return 'Windows Phone'
  if (/Windows NT/i.test(s)) return 'Windows'
  // iPadOS 桌面模式：Macintosh + Mobile，归到 iOS 比归到 macOS 更接近事实
  if (/Macintosh|Mac OS X/i.test(s)) return /Mobile/i.test(s) ? 'iOS' : 'macOS'
  if (/CrOS/i.test(s)) return 'ChromeOS'
  if (/Linux/i.test(s)) return 'Linux'
  return ''
}

function detectBrowser(s) {
  if (/MicroMessenger/i.test(s)) return '微信'
  if (/DingTalk/i.test(s)) return '钉钉'
  if (/QQBrowser|QQ\//i.test(s)) return 'QQ 浏览器'
  if (/Edg[A-Z]?\//i.test(s)) return 'Edge'
  if (/OPR\/|Opera/i.test(s)) return 'Opera'
  if (/Firefox\/|FxiOS/i.test(s)) return 'Firefox'
  // Chrome 家族还包含 Chromium 内核的国产浏览器，统一归到 Chrome 比标「未知」有用
  if (/Chrome\/|CriOS/i.test(s)) return 'Chrome'
  if (/Safari\//i.test(s)) return 'Safari'
  return ''
}
