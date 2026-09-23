/**
 * 维护模式的提示页。
 *
 * 为什么要单独做一个页面，而不是直接 502 / 403：
 * 维护模式是**管理员主动打开**的状态，访客看到的应当是一个说明「稍后回来」的页面，
 * 而不是一个看起来像服务挂了的错误。所以文案、配色与站点保持一致，
 * 并明确区分「计划内的维护」与「服务异常」这两件事。
 *
 * 用内联样式而不是站点 CSS：维护模式最常见的触发场景恰恰是「正在重新构建」，
 * 那时候 /assets/* 里的哈希文件可能已经换了名字或暂时缺位。
 * 一个还要依赖其他资源的错误页，会在最需要它的时候白屏。
 */

import { escapeHtml } from './html.mjs'

/**
 * @param {{ brand?: string, message?: string, retryAfterMinutes?: number }} options
 * @returns {string} 完整的 HTML 文档
 */
export function maintenancePage({ brand = 'Tech Notes', message = '', retryAfterMinutes = 30 } = {}) {
  const title = escapeHtml(brand)
  const note = escapeHtml(
    message || '站点正在更新内容，暂时无法访问。给内容一点整理的时间，很快就回来。'
  )

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<title>${title} · 维护中</title>
<style>
  :root {
    --bg: #fdfbf7;
    --surface: #ffffff;
    --line: #ece5db;
    --ink: #1a1714;
    --ink-2: #59534b;
    --ink-3: #b0a89f;
    --primary: #f26b1d;
    --soft: #fdf1e7;
  }
  * { box-sizing: border-box; }
  html, body { height: 100%; }
  body {
    margin: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    background:
      radial-gradient(1100px 520px at 50% -8%, #fdf1e7 0%, rgba(253, 241, 231, 0) 62%),
      var(--bg);
    color: var(--ink);
    font-family: 'Noto Sans SC', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC',
      'Hiragino Sans GB', 'Microsoft YaHei', sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  .card {
    width: 100%;
    max-width: 460px;
    padding: 40px 36px 32px;
    border: 1px solid var(--line);
    border-radius: 18px;
    background: var(--surface);
    box-shadow: 0 24px 60px -42px rgba(26, 23, 20, 0.4);
    text-align: center;
  }
  .mark {
    width: 46px;
    height: 46px;
    margin: 0 auto 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 14px;
    background: var(--soft);
    color: var(--primary);
  }
  h1 {
    margin: 0 0 10px;
    font-size: 19px;
    font-weight: 700;
    letter-spacing: -0.2px;
  }
  p {
    margin: 0;
    font-size: 13px;
    line-height: 1.85;
    color: var(--ink-2);
  }
  .meta {
    margin-top: 26px;
    padding-top: 18px;
    border-top: 1px solid var(--line);
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    font-size: 11.5px;
    color: var(--ink-3);
  }
  .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--primary);
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #16130f;
      --surface: #1f1b17;
      --line: #2e2822;
      --ink: #f4f0eb;
      --ink-2: #c3bbb2;
      --ink-3: #7d756c;
      --soft: #2a211a;
    }
    body { background: var(--bg); }
  }
</style>
</head>
<body>
  <main class="card">
    <span class="mark" aria-hidden="true">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
           stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 3.5 4.5 7v5c0 4.2 3 7.2 7.5 8.5 4.5-1.3 7.5-4.3 7.5-8.5V7Z" />
        <path d="M9.5 12h5M12 9.5v5" />
      </svg>
    </span>
    <h1>站点维护中</h1>
    <p>${note}</p>
    <p class="meta">
      <span class="dot" aria-hidden="true"></span>
      <span>预计 ${retryAfterMinutes} 分钟内恢复</span>
    </p>
  </main>
</body>
</html>
`
}
