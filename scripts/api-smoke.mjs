#!/usr/bin/env node
/**
 * 后台 API 端到端冒烟测试。
 *
 * 覆盖真实链路：密码登录 → 2FA 绑定 → 验证码登录 → 仪表盘 → 会话 → 操作日志 →
 * 内容列表与状态流转 → 站点设置读写与校验 → 维护模式 → 日志清理 → 改密 → 登出。
 * 这是「功能是否真的可用」的判据 —— 比看页面截图可靠，也不依赖浏览器。
 *
 * 用法（服务需已在运行）：
 *   node scripts/api-smoke.mjs <邮箱> <密码> [baseUrl]
 *   TOTP_SECRET=<已绑定的密钥> node scripts/api-smoke.mjs <邮箱> <密码>
 *
 * 首次针对全新数据库运行时，脚本会自己完成 2FA 绑定，并在结尾打印密钥，
 * 之后重跑需要带上该密钥（或先关闭两步验证）。
 *
 * 注意：本脚本会真的改数据（绑定 2FA、重置恢复码、改显示名并改回、切换文章状态、
 * 开关维护模式、递增再还原每周目标），只应指向一次性实例，不要指向生产库。
 * 「彻底删除文章」这一步不可逆，因此额外加一道开关，默认跳过：
 *   SMOKE_ALLOW_DELETE=1 node scripts/api-smoke.mjs <邮箱> <密码>
 */
import { NobleCryptoPlugin, ScureBase32Plugin, generateSync } from 'otplib'

const [, , email, password, baseUrlArg] = process.argv
const BASE = (baseUrlArg ?? process.env.BASE_URL ?? 'http://127.0.0.1:18007').replace(/\/$/, '')

if (!email || !password) {
  console.error('用法: node scripts/api-smoke.mjs <邮箱> <密码> [baseUrl]')
  process.exit(2)
}

const CRYPTO = new NobleCryptoPlugin()
const BASE32 = new ScureBase32Plugin()

const results = []
let cookie = ''

function ok(name, detail = '') {
  results.push({ name, pass: true, detail })
  console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ''}`)
}

function fail(name, detail = '') {
  results.push({ name, pass: false, detail })
  console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`)
}

function assert(name, condition, detail = '') {
  condition ? ok(name, detail) : fail(name, detail)
}

async function call(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    redirect: 'manual',
  })
  const setCookie = res.headers.getSetCookie?.() ?? []
  const session = setCookie.find((c) => c.startsWith('tn_admin='))
  if (session) {
    const value = session.split(';')[0]
    cookie = value.endsWith('tn_admin=') ? '' : value
  }
  const text = await res.text()
  let json = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    /* 非 JSON 响应保留原文 */
  }
  return { status: res.status, json, text, headers: res.headers }
}

/**
 * 递归比较两侧的「结构」：只看键是否存在、同层是数组还是对象，不比较标量取值。
 *
 * 为什么不比取值：库内容会因为后台正常编辑而合法地分叉，兜底内容留在种子状态。
 * 真正会出事的是**结构**分叉 —— 库里少一列、`site_sections` 的 JSON 解析失败、
 * 某段拼装只在服务端写过一遍，都会让前台在「接口正常」和「接口挂了」两种情况下
 * 渲染出两块不同的界面，而这在只测一侧时永远发现不了。
 */
function shapeDrift(a, b, path = '$', out = []) {
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b)) {
      out.push(`${path} 一侧是数组、另一侧不是`)
      return out
    }
    // 数组只取首个元素当样本：空数组与单元素数组视为同构，长度差异属正常编辑
    if (a.length && b.length) shapeDrift(a[0], b[0], `${path}[0]`, out)
    return out
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
      if (!(key in a)) out.push(`${path}.${key} 仅兜底侧有`)
      else if (!(key in b)) out.push(`${path}.${key} 仅库侧有`)
      else shapeDrift(a[key], b[key], `${path}.${key}`, out)
    }
  }
  return out
}

/** otplib v13 的函数式用法：generateSync 直接导出于包根，插件需显式传入 */
const totpCode = (secret) => generateSync({ secret, crypto: CRYPTO, base32: BASE32 })

async function main() {
  console.log(`\n后台 API 冒烟测试 → ${BASE}\n`)

  // 1. 健康检查
  const health = await call('GET', '/api/health')
  assert('健康检查 /api/health 返回 ok', health.status === 200 && health.json?.ok === true)

  // 2. 未登录访问受保护接口应 401
  const guard = await call('GET', '/api/admin/me')
  assert('未登录访问 /api/admin/me 返回 401', guard.status === 401)

  // 2b. 未知接口路径必须 JSON 404 —— 被 SPA 回退成 200 + HTML 会把路径写错伪装成成功
  const nope = await call('GET', '/api/definitely-not-here')
  assert(
    '未知 /api 路径返回 JSON 404',
    nope.status === 404 && nope.json?.error === '接口不存在',
    `${nope.status} ${String(nope.text ?? '').slice(0, 40)}`
  )

  /*
   * 2c. 公开内容接口 —— 走**匿名**请求（此时还没有任何会话 Cookie）。
   *
   * 这一段必须在登录之前：一旦带上 Cookie 就证明不了「前台不依赖登录态」，
   * 而前台是纯静态产物，它拿不到也不该拿到管理员会话。
   */
  const content = await call('GET', '/api/content')
  const doc = content.json ?? {}
  const PUBLIC_KEYS = ['site', 'home', 'resume', 'projects', 'posts', 'filters', 'stats']
  assert(
    '匿名可读 /api/content 且七大分区齐全',
    content.status === 200 && PUBLIC_KEYS.every((k) => doc[k] != null),
    `已发布文章 ${doc.posts?.length} 篇 · 项目 ${doc.projects?.length} 个 · 缺 ${
      PUBLIC_KEYS.filter((k) => doc[k] == null).join(',') || '无'
    }`
  )
  assert(
    '内容接口不缓存（后台一改，前台刷新即变）',
    /no-store/.test(content.headers?.get('cache-control') ?? ''),
    content.headers?.get('cache-control') ?? '(无 Cache-Control)'
  )

  /*
   * 2d. 库内容与前台兜底内容必须**同构**。
   *
   * 两侧跑同一个 presentContent()，但入库再出库这一圈可能丢字段。只比结构不比取值：
   * 取值会因后台正常编辑而合法分叉，结构分叉才是缺陷。
   *
   * `generatedAt` 要先摘掉：它是接口在 presentContent 之外加的一层信封（前台兜底
   * 不需要「服务端生成时间」这个概念），不属于内容契约本身。
   */
  const { content: seedContent } = await import('../shared/content.mjs')
  const { presentContent } = await import('../shared/derive.mjs')
  const { generatedAt: _envelope, ...dbContent } = doc
  const drift = shapeDrift(presentContent(seedContent), dbContent)
  assert(
    '库内容与前台兜底内容结构一致（防种子/取数漂移）',
    drift.length === 0,
    drift.length ? drift.slice(0, 4).join(' · ') : '键集合与嵌套逐层一致'
  )

  /*
   * 2e. 站点级事实只有一处写法。
   *
   * 姓名/职位/邮箱在站点设置、首页名片、简历抬头、文章作者卡四个地方出现，
   * 全部由 settings 派生。这里断言四处取值相同 —— 一旦有人图省事在某一处写死，
   * 「改了站点设置但简历页还是旧名字」这类问题就会立刻被拦下。
   */
  assert(
    '站点级事实同源（设置 / 首页名片 / 简历抬头三处一致）',
    Boolean(doc.site?.author) &&
      doc.home?.about?.profile?.name === doc.site.author &&
      doc.resume?.header?.name === doc.site.author &&
      doc.home?.about?.profile?.role === doc.site.role &&
      doc.resume?.header?.role === doc.site.role,
    `${doc.site?.author} · ${doc.site?.role}`
  )

  // 2f. 单篇详情：正文、目录、上下篇、作者卡；未知 slug 必须 JSON 404
  const firstSlug = doc.posts?.[0]?.slug
  if (!firstSlug) {
    fail('读取单篇文章详情', '内容接口里没有已发布文章可测')
  } else {
    const one = await call('GET', `/api/content/posts/${firstSlug}`)
    const detail = one.json ?? {}
    assert(
      '匿名可读单篇文章详情（正文 + 目录）',
      one.status === 200 && detail.slug === firstSlug && typeof detail.body === 'string',
      `《${detail.title}》 · 正文 ${detail.body?.length ?? 0} 字 · 目录 ${detail.toc?.length ?? 0} 项`
    )
    assert(
      '详情带作者卡与上下篇，且不外泄状态字段',
      detail.author?.name === doc.site?.author &&
        (detail.prev === null || typeof detail.prev?.slug === 'string') &&
        (detail.next === null || typeof detail.next?.slug === 'string') &&
        !('status' in detail),
      `上一篇 ${detail.prev?.slug ?? '—'} · 下一篇 ${detail.next?.slug ?? '—'}`
    )
  }

  const ghost = await call('GET', '/api/content/posts/definitely-not-a-post')
  assert(
    '不存在的文章返回 JSON 404（而不是 200 空壳）',
    ghost.status === 404 && Boolean(ghost.json?.error),
    ghost.json?.error ?? `HTTP ${ghost.status}`
  )

  // 3. 登录
  let login = await call('POST', '/api/admin/login', { email, password, remember: true })
  let enrolledSecret = null

  if (login.status === 401) {
    fail('密码登录', login.json?.error ?? `HTTP ${login.status}`)
    return
  }
  if (login.json?.stage === '2fa') {
    const secret = process.env.TOTP_SECRET
    assert('密码登录 → 进入两步验证阶段', true)
    if (!secret) {
      fail('2FA 验证', '该账号已绑定两步验证，请用 TOTP_SECRET=<密钥> 重跑')
      return
    }
    const code = await totpCode(secret)
    login = await call('POST', '/api/admin/2fa/verify', { ticket: login.json.ticket, code })
  }
  assert('登录成功并签发会话 Cookie', Boolean(cookie), cookie ? 'tn_admin 已设置' : '无 Cookie')

  // 4. 身份
  const me = await call('GET', '/api/admin/me')
  assert('读取当前管理员 /api/admin/me', me.status === 200 && Boolean(me.json?.user?.email), me.json?.user?.email)

  // 5. 仪表盘：三个档位的趋势长度都要对得上
  for (const range of [7, 30, 365]) {
    const dash = await call('GET', `/api/admin/dashboard?range=${range}`)
    const trendLen = dash.json?.trend?.length ?? 0
    assert(
      `仪表盘 range=${range} 趋势补齐到 ${range} 个点`,
      dash.status === 200 && trendLen === range,
      `KPI 已发布 ${dash.json?.kpis?.published?.value} · 草稿 ${dash.json?.kpis?.drafts?.value} · 访客 ${dash.json?.kpis?.visitors?.value}`
    )
  }

  // 6. 2FA 状态 + 绑定
  const status0 = await call('GET', '/api/admin/2fa/status')
  assert('读取两步验证状态', status0.status === 200)

  if (!status0.json?.enabled) {
    const setup = await call('POST', '/api/admin/2fa/setup')
    enrolledSecret = setup.json?.secret ?? null
    assert('生成 2FA 密钥与二维码', Boolean(enrolledSecret) && String(setup.json?.qrDataUrl).startsWith('data:image/png'), `otpauth 前缀 ${String(setup.json?.otpauth).slice(0, 22)}…`)

    const code = await totpCode(enrolledSecret)
    const enable = await call('POST', '/api/admin/2fa/enable', { code, deviceLabel: 'API 冒烟测试' })
    assert('用验证码启用两步验证', enable.status === 200 && enable.json?.recoveryCodes?.length === 8, `恢复码 ${enable.json?.recoveryCodes?.length} 个`)

    const status1 = await call('GET', '/api/admin/2fa/status')
    assert('状态回读：已启用且恢复码 8 个', status1.json?.enabled === true && status1.json?.recovery?.remaining === 8)
  } else {
    ok('两步验证此前已启用，跳过绑定步骤')
  }

  // 7. 登录设备
  const sessions = await call('GET', '/api/admin/sessions')
  const current = (sessions.json?.sessions ?? []).filter((s) => s.current)
  assert('登录设备列表包含当前会话', sessions.status === 200 && current.length === 1, `共 ${sessions.json?.sessions?.length} 条`)

  // 8. 操作日志：翻译成人话、计数、操作者、保留期
  const logs = await call('GET', '/api/admin/audit-logs')
  const logItems = logs.json?.items ?? []
  const actions = new Set(logItems.map((l) => l.action))
  assert('操作日志包含登录事件', actions.has('login'), `${logs.json?.total} 条 / 返回 ${logItems.length} 条`)
  assert(
    '动作码已翻译成中文句式（无未登记动作）',
    logItems.length > 0 && logItems.every((l) => l.actionKnown && l.text && !/^[a-z_]+$/.test(l.text)),
    logItems[0]?.text ?? ''
  )
  assert(
    '日志附带保留策略与结果计数',
    logs.json?.retentionDays === 90 &&
      typeof logs.json?.expired === 'number' &&
      logs.json?.counts?.all === (logs.json?.counts?.success ?? 0) + (logs.json?.counts?.failed ?? 0),
    `保留 ${logs.json?.retentionDays} 天 · 成功 ${logs.json?.counts?.success} / 失败 ${logs.json?.counts?.failed}`
  )
  assert('操作者候选列表排除 system 账号', Array.isArray(logs.json?.actors) && !logs.json.actors.some((a) => a.value === 'system'))

  const failedOnly = await call('GET', '/api/admin/audit-logs?result=failed&range=0')
  assert(
    '按「失败」筛选只返回失败记录',
    failedOnly.status === 200 && (failedOnly.json?.items ?? []).every((l) => l.result === 'failed'),
    `${failedOnly.json?.total} 条失败记录`
  )

  const noActionFilter = await call('GET', '/api/admin/audit-logs?result=bogus&range=13&actor=%20')
  assert(
    '非法筛选参数被收敛成默认值而不是报错',
    noActionFilter.status === 200 && noActionFilter.json?.result === 'all' && noActionFilter.json?.range === 7,
    `result=${noActionFilter.json?.result} range=${noActionFilter.json?.range}`
  )

  // 9. 账号资料
  const before = await call('GET', '/api/admin/account')
  const name0 = before.json?.user?.displayName ?? ''
  const patched = await call('PATCH', '/api/admin/account', { displayName: `${name0}·` })
  const reverted = await call('PATCH', '/api/admin/account', { displayName: name0 })
  assert('修改显示名称并回滚', patched.status === 200 && reverted.status === 200, `“${name0}” → “${name0}·” → “${name0}”`)

  // 10. 改密错误路径：当前密码不对必须 401
  const badPwd = await call('POST', '/api/admin/account/password', {
    currentPassword: 'not-the-real-password',
    newPassword: 'Zx9!aVeryLongPassword',
  })
  assert('当前密码错误时改密返回 401', badPwd.status === 401, badPwd.json?.error ?? '')

  // 11. 恢复码重新生成（要密码）
  const regen = await call('POST', '/api/admin/2fa/recovery-codes', { password })
  assert('重新生成恢复码', regen.status === 200 && regen.json?.recoveryCodes?.length === 8)

  // 12. 内容列表：计数、分页、分类
  const listAll = await call('GET', '/api/admin/posts')
  const counts = listAll.json?.counts ?? {}
  assert(
    '文章列表返回计数与分页信息',
    listAll.status === 200 &&
      Array.isArray(listAll.json?.items) &&
      counts.all === (counts.published ?? 0) + (counts.draft ?? 0) + (counts.trash ?? 0),
    `全部 ${counts.all} · 已发布 ${counts.published} · 草稿 ${counts.draft} · 回收站 ${counts.trash}`
  )

  const perPage = listAll.json?.perPage ?? 0
  assert(
    `每页默认 ${perPage} 条且本页不超过该值`,
    perPage > 0 && Array.isArray(listAll.json?.items) && listAll.json.items.length <= perPage,
    `本页 ${listAll.json?.items?.length} 条 / 共 ${listAll.json?.totalPages} 页`
  )

  const cats = await call('GET', '/api/admin/categories')
  assert(
    '分类列表返回且带文章计数',
    cats.status === 200 && Array.isArray(cats.json?.items) && cats.json.items.length > 0,
    cats.json?.items?.map((c) => `${c.name}:${c.postCount}`).join(' ')
  )

  // 13. 越界页码收敛到最后一页，而不是空列表或报错
  const wayOut = await call('GET', '/api/admin/posts?page=9999')
  assert(
    '越界页码收敛到最后一页',
    wayOut.status === 200 && wayOut.json?.page === wayOut.json?.totalPages,
    `page=${wayOut.json?.page} / totalPages=${wayOut.json?.totalPages}`
  )

  // 14. 参数校验：非法状态 400、不存在的文章 404（都不写库）
  const badStatus = await call('PATCH', '/api/admin/posts/1', { status: 'whatever' })
  assert('非法状态返回 400', badStatus.status === 400, badStatus.json?.error ?? '')

  const missing = await call('PATCH', '/api/admin/posts/99999999', { status: 'draft' })
  assert('不存在的文章返回 404', missing.status === 404, missing.json?.error ?? '')

  // 15. 状态流转：草稿 ⇄ 回收站 ⇄ 已发布，顺带验证回收站筛选与删除保护
  const target = listAll.json?.items?.[0]
  if (!target) {
    fail('文章状态流转', '库里没有文章可测')
  } else {
    const original = target.status
    const toDraft = await call('PATCH', `/api/admin/posts/${target.id}`, { status: 'draft' })
    assert('文章转为草稿', toDraft.status === 200 && toDraft.json?.post?.status === 'draft', toDraft.json?.error ?? '')

    const toTrash = await call('PATCH', `/api/admin/posts/${target.id}`, { status: 'trash' })
    assert('文章移入回收站', toTrash.status === 200 && toTrash.json?.post?.status === 'trash', toTrash.json?.error ?? '')

    const trashList = await call('GET', '/api/admin/posts?status=trash')
    assert(
      '回收站筛选能查到该文章',
      trashList.status === 200 && trashList.json?.items?.some((p) => p.id === target.id),
      `回收站 ${trashList.json?.total} 篇`
    )

    /*
     * 「数据归属后台」的闭环判据：后台一移入回收站，公开内容接口必须**当场**不再返回它。
     *
     * 这一条是整套改造的验收核心 —— 只断言后台自己的列表变了，证明不了前台跟着变；
     * 而草稿/回收站里的内容外泄，本身就是最该拦住的那类事故。
     */
    const publicAfterTrash = await call('GET', '/api/content')
    assert(
      '移入回收站后前台内容接口立即不再返回该文章',
      publicAfterTrash.status === 200 &&
        !(publicAfterTrash.json?.posts ?? []).some((p) => p.slug === target.slug),
      `前台仍列 ${publicAfterTrash.json?.posts?.length} 篇 · 《${target.title}》已下架`
    )

    // 不在回收站的文章禁止彻底删除 —— 这是防手滑的那道闸
    const restored = await call('PATCH', `/api/admin/posts/${target.id}`, { status: 'published' })
    const illegalDelete = await call('DELETE', `/api/admin/posts/${target.id}`)
    assert(
      '不在回收站的文章彻底删除返回 409',
      restored.status === 200 && illegalDelete.status === 409,
      illegalDelete.json?.error ?? ''
    )

    if (process.env.SMOKE_ALLOW_DELETE === '1') {
      await call('PATCH', `/api/admin/posts/${target.id}`, { status: 'trash' })
      const removed = await call('DELETE', `/api/admin/posts/${target.id}`)
      assert(
        '回收站中的文章可以彻底删除',
        removed.status === 200 && removed.json?.deleted === true,
        removed.json?.error ?? ''
      )
    } else {
      await call('PATCH', `/api/admin/posts/${target.id}`, { status: original })
      ok('跳过彻底删除（不可逆，需 SMOKE_ALLOW_DELETE=1 才执行），已还原原状态')
    }
  }

  /*
   * 15b. 编辑器的写入路径。
   *
   * 前面的状态流转只证明「后台自己的列表变了」。这里补的是「后台能改内容」到
   * 「前台跟着变」之间的那半截：从新建开始，走完「建 → 改正文 → 加标签 → 回读 →
   * 前台可见 → 移入回收站 → 前台不可见 → 彻底删除」一整圈。
   *
   * 全程用**自己刚建的那一篇**做实验，不碰库里既有内容；结尾无论如何都把它删掉，
   * 免得反复跑冒烟把测试文章堆在列表里。
   */
  const stamp = Date.now().toString(36)
  const editorTitle = `冒烟测试文章 ${stamp}`
  const created = await call('POST', '/api/admin/posts', {
    title: editorTitle,
    excerpt: '由冒烟测试创建，用于验证编辑器的写入路径。',
    body: '## 写入路径\n\n占位正文。',
  })
  const newId = created.json?.post?.id
  const newSlug = created.json?.post?.slug ?? ''
  assert(
    '新建文章落到草稿状态（新建即发布是最容易误发的一步）',
    created.status === 201 && created.json?.post?.status === 'draft' && Number.isInteger(newId),
    `id=${newId} slug=${newSlug}`
  )
  assert(
    '中文标题的永久链接由服务端兜底成合法 slug',
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(newSlug),
    `slug=${newSlug}`
  )

  const detail0 = await call('GET', `/api/admin/posts/${newId}`)
  assert(
    '单篇接口返回正文、标签与下拉候选',
    detail0.status === 200 &&
      typeof detail0.json?.post?.body === 'string' &&
      Array.isArray(detail0.json?.post?.tags) &&
      Array.isArray(detail0.json?.categories) &&
      Array.isArray(detail0.json?.allTags) &&
      typeof detail0.json?.author === 'string',
    `分类 ${detail0.json?.categories?.length} 个 · 标签 ${detail0.json?.allTags?.length} 个`
  )

  // 字段校验：不合格的输入必须在落库前被挡下（校验全部发生在写库之前）
  const noTitle = await call('POST', '/api/admin/posts', { title: '   ' })
  assert('标题为空时新建返回 400', noTitle.status === 400, noTitle.json?.error ?? '')

  const badSlug = await call('PATCH', `/api/admin/posts/${newId}`, { slug: '中文 链接' })
  assert('永久链接含非法字符返回 400', badSlug.status === 400, badSlug.json?.error ?? '')

  /*
   * 撞车的对照项必须**当场从库里取**，不能复用前面的 `target`：
   * 上面第 15 步在 SMOKE_ALLOW_DELETE=1 时已经把 `target` 真的删掉了，
   * 拿它的 slug 去撞会撞到空气 —— 于是这一条静默通过（还顺手把本文的 slug 改掉，
   * 让后面两条前台断言一起失败）。依赖「另一个变量还存在」的断言就是这样烂掉的。
   */
  const siblings = await call('GET', '/api/admin/posts?perPage=50')
  const otherSlug = (siblings.json?.items ?? []).find((p) => p.id !== newId)?.slug
  const takenSlug = await call('PATCH', `/api/admin/posts/${newId}`, { slug: otherSlug ?? 'no-such-slug' })
  assert(
    '永久链接与别人撞车返回 409（而不是静默改名）',
    Boolean(otherSlug) && otherSlug !== newSlug && takenSlug.status === 409,
    `撞 ${otherSlug} → HTTP ${takenSlug.status}${takenSlug.json?.error ? ` · ${takenSlug.json.error}` : ''}`
  )

  const newBody = `## 改过的标题\n\n正文在冒烟测试里被改写过：${stamp}\n\n\`\`\`\nadb shell uiautomator dump\n\`\`\``
  const savedBody = await call('PATCH', `/api/admin/posts/${newId}`, {
    body: newBody,
    tags: ['冒烟测试', '自动化'],
    excerpt: `改过的摘要 ${stamp}`,
  })
  const tagNames = [...(savedBody.json?.post?.tags ?? [])].sort()
  assert(
    '保存正文、摘要与标签后回读一致',
    savedBody.status === 200 &&
      savedBody.json?.post?.body === newBody &&
      savedBody.json?.post?.excerpt === `改过的摘要 ${stamp}` &&
      tagNames.join(',') === ['冒烟测试', '自动化'].sort().join(','),
    `标签 ${tagNames.join(' / ')} · 回执字段 ${(savedBody.json?.fields ?? []).join('、')}`
  )
  assert(
    '保存正文时刷新阅读时长缓存列',
    /^约 \d+ 分钟$/.test(savedBody.json?.post?.readingTime ?? ''),
    `readingTime=${savedBody.json?.post?.readingTime}`
  )

  const detail1 = await call('GET', `/api/admin/posts/${newId}`)
  assert(
    '新标签进入标签池，可供后续文章复用',
    ['冒烟测试', '自动化'].every((t) => (detail1.json?.allTags ?? []).includes(t)),
    `标签池 ${detail1.json?.allTags?.length} 个`
  )

  /*
   * 只提交改动过的字段，而不是整篇回传 —— 这不只是省字节：审计文案由提交的字段拼成，
   * 全量提交会让「只改了一个错别字」在操作日志里显得像改了整篇。
   */
  const onlyTitle = await call('PATCH', `/api/admin/posts/${newId}`, { title: `${editorTitle}（改）` })
  assert(
    '只提交标题时回执只列「标题」一项',
    onlyTitle.status === 200 && (onlyTitle.json?.fields ?? []).join(',') === '标题',
    `fields=${(onlyTitle.json?.fields ?? []).join('、') || '(空)'}`
  )

  const unknownKey = await call('PATCH', `/api/admin/posts/${newId}`, { title: editorTitle, bogus_field: 'x' })
  assert(
    '白名单之外的字段被丢弃，不会写进库里',
    unknownKey.status === 200 && !('bogus_field' in (unknownKey.json?.post ?? {})),
    `回执字段 ${(unknownKey.json?.fields ?? []).join('、')}`
  )

  const emptyPatch = await call('PATCH', `/api/admin/posts/${newId}`, {})
  assert(
    '空提交是显式的空操作（changed=false），不产生审计噪音',
    emptyPatch.status === 200 && emptyPatch.json?.changed === false && (emptyPatch.json?.fields ?? []).length === 0
  )

  const ghostPost = await call('PATCH', '/api/admin/posts/99999999', { body: 'x' })
  assert('不存在的文章保存返回 404', ghostPost.status === 404, ghostPost.json?.error ?? '')

  // 闭环：后台改完，前台内容接口必须当场反映新正文
  const publicPost = await call('GET', `/api/content/posts/${encodeURIComponent(newSlug)}`)
  assert(
    '草稿不出现在前台单篇接口（未发布即未发布）',
    publicPost.status === 404,
    `HTTP ${publicPost.status}`
  )
  /** 发布前的篇数，用来断言「发布后恰好多一篇」——只断言「能找到」会漏掉重复计入 */
  const publishedBefore = (await call('GET', '/api/content')).json?.posts?.length ?? 0

  const publishNow = await call('PATCH', `/api/admin/posts/${newId}`, { status: 'published' })
  const publicAfterPublish = await call('GET', '/api/content/posts/' + encodeURIComponent(newSlug))
  assert(
    '发布后前台单篇接口立刻取到刚保存的正文',
    publishNow.status === 200 &&
      publicAfterPublish.status === 200 &&
      String(publicAfterPublish.json?.body ?? '').includes(stamp),
    `HTTP ${publicAfterPublish.status} · 正文 ${String(publicAfterPublish.json?.body ?? '').length} 字`
  )

  const listAfterPublish = await call('GET', '/api/content')
  const publishedPosts = listAfterPublish.json?.posts ?? []
  assert(
    '发布后出现在前台文章列表里，且列表恰好多出一篇',
    publishedPosts.some((p) => p.slug === newSlug) && publishedPosts.length === publishedBefore + 1,
    `发布前 ${publishedBefore} 篇 → 发布后 ${publishedPosts.length} 篇`
  )

  // 收回草稿：前台必须立刻当它不存在
  await call('PATCH', `/api/admin/posts/${newId}`, { status: 'draft' })
  const publicAfterUnpublish = await call('GET', `/api/content/posts/${encodeURIComponent(newSlug)}`)
  const listAfterUnpublish = await call('GET', '/api/content')
  assert(
    '转回草稿后前台立刻不可见（单篇 404 且不在列表里）',
    publicAfterUnpublish.status === 404 &&
      !(listAfterUnpublish.json?.posts ?? []).some((p) => p.slug === newSlug),
    `单篇 HTTP ${publicAfterUnpublish.status}`
  )

  // 清场：自己建的测试文章自己删掉（移入回收站是彻底删除的前置条件）
  await call('PATCH', `/api/admin/posts/${newId}`, { status: 'trash' })
  const cleanup = await call('DELETE', `/api/admin/posts/${newId}`)
  assert('清理：测试文章已彻底删除', cleanup.status === 200 && cleanup.json?.deleted === true, cleanup.json?.error ?? '')

  // 15b. 项目管理：增删改、精选标记与拖拽排序
  const projectsBefore = await call('GET', '/api/admin/projects')
  const seedProjects = projectsBefore.json?.items ?? []
  const baseCounts = projectsBefore.json?.counts
  /* 各语言计数之和必须等于「有语言的项目数」。这条能抓住分组漏项：某个语言被漏掉时，
     那批项目就在筛选条上点不到。用有语言的数量做基准，而不是总数 —— 没填语言的项目
     本来就不在任何语言分组里，拿总数当基准会变成一条会被正常数据打破的假断言。 */
  const languageSum = (projectsBefore.json?.languages ?? []).reduce((s, l) => s + l.count, 0)
  const withLanguage = seedProjects.filter((p) => p.language).length

  assert(
    '项目列表：计数与列表长度一致，语言筛选条逐项有计数',
    projectsBefore.status === 200 &&
      seedProjects.length === baseCounts?.all &&
      (projectsBefore.json?.languages ?? []).length > 0 &&
      (projectsBefore.json?.languages ?? []).every((l) => l.count > 0),
    `${seedProjects.length} 个项目 · ${projectsBefore.json?.languages?.length ?? 0} 种语言 · 累计 ${baseCounts?.starsLabel} stars`
  )
  assert(
    '各语言计数之和等于有语言的项目数（没有项目落在筛选之外）',
    languageSum === withLanguage,
    `语言合计 ${languageSum} / 有语言 ${withLanguage}`
  )

  const projectCreated = await call('POST', '/api/admin/projects', {
    title: '冒烟测试项目',
    description: '由 api-smoke 创建，跑完即删。',
    tags: 'TypeScript · 测试',
    language: 'TypeScript',
    stars: 123,
    forks: 4,
    repoUrl: 'https://example.com/smoke-project',
  })
  const createdProject = projectCreated.json?.project
  assert(
    '新建项目：自动生成永久链接、默认不进精选（进精选是一次明确选择）',
    projectCreated.status === 201 && Boolean(createdProject?.slug) && createdProject?.featured === false,
    `HTTP ${projectCreated.status} · slug=${createdProject?.slug ?? '-'}`
  )

  const afterCreate = await call('GET', '/api/admin/projects')
  assert(
    '新建项目排到列表末尾（不插队，免得回头找不到它）',
    afterCreate.json?.items?.at(-1)?.id === createdProject?.id,
    `末尾是「${afterCreate.json?.items?.at(-1)?.title ?? '-'}」`
  )
  assert(
    '项目数与 stars 累计同步更新',
    afterCreate.json?.counts?.all === baseCounts?.all + 1 &&
      afterCreate.json?.counts?.stars === baseCounts?.stars + 123,
    `${afterCreate.json?.counts?.all} 个项目 · 累计 ${afterCreate.json?.counts?.starsLabel}`
  )

  const projectUpdated = await call('PATCH', `/api/admin/projects/${createdProject?.id}`, {
    title: '冒烟测试项目（已改）',
    featured: true,
    stars: 321,
  })
  assert(
    '更新项目：精选标记与 stars 一起写入',
    projectUpdated.status === 200 && projectUpdated.json?.project?.featured === true && projectUpdated.json?.project?.stars === 321,
    projectUpdated.json?.error ?? `字段：${projectUpdated.json?.fields?.join('、') ?? '-'}`
  )
  assert(
    '精选数随之 +1',
    projectUpdated.json?.counts?.featured === baseCounts?.featured + 1,
    `${baseCounts?.featured} → ${projectUpdated.json?.counts?.featured}`
  )

  // 前台闭环：后台标记的精选项目必须出现在前台项目列表里
  const projectContent = await call('GET', '/api/content')
  assert(
    '标记精选的项目出现在前台项目列表里',
    (projectContent.json?.projects ?? []).some((p) => p.slug === createdProject?.slug),
    `前台共 ${projectContent.json?.projects?.length ?? 0} 个项目`
  )

  // 拖拽排序：整份 id 列表倒过来提交，下标即新顺序
  const orderBefore = (await call('GET', '/api/admin/projects')).json?.items?.map((p) => p.id) ?? []
  const reversed = [...orderBefore].reverse()
  const projectReordered = await call('POST', '/api/admin/projects/reorder', { ids: reversed })
  assert(
    '拖拽排序：整份顺序按提交下标落库',
    projectReordered.status === 200 && JSON.stringify(projectReordered.json?.items?.map((p) => p.id)) === JSON.stringify(reversed),
    `前三位 ${orderBefore.slice(0, 3).join(',')} → ${projectReordered.json?.items?.slice(0, 3).map((p) => p.id).join(',')}`
  )
  /*
   * 这条是排序这件事的闭环判据：倒序之后，刚才那个精选项目拿到了最小的 sort_order，
   * 而前台把精选排在前面 —— 于是它必须出现在前台第一位。
   * 只断言「后台列表顺序变了」不够：前台完全可以不读 sort_order 而照样通过。
   */
  const frontendOrder = (await call('GET', '/api/content')).json?.projects?.map((p) => p.id) ?? []
  assert(
    '前台项目顺序真的跟着后台排序走（拖到最前的精选项目现在排首位）',
    frontendOrder[0] === createdProject?.id,
    `前台首位 id=${frontendOrder[0] ?? '-'}，期望 ${createdProject?.id ?? '-'}`
  )

  const orderCases = [
    ['排序列表不完整被拒（筛选状态下不允许拖拽）', await call('POST', '/api/admin/projects/reorder', { ids: reversed.slice(0, 2) }), 400],
    ['排序列表有重复项被拒', await call('POST', '/api/admin/projects/reorder', { ids: [...reversed, reversed[0]] }), 400],
    ['排序列表不是数组被拒', await call('POST', '/api/admin/projects/reorder', { ids: 'all' }), 400],
    ['排序列表含非法值被拒', await call('POST', '/api/admin/projects/reorder', { ids: [...reversed.slice(1), 'abc'] }), 400],
  ]
  for (const [name, res, want] of orderCases) {
    assert(name, res.status === want, `HTTP ${res.status}${res.status !== want ? ` · ${res.json?.error}` : ''}`)
  }

  const slugTaken = await call('PATCH', `/api/admin/projects/${createdProject?.id}`, { slug: seedProjects[0]?.slug })
  assert(
    '项目永久链接与别人撞车返回 409（而不是静默改名）',
    slugTaken.status === 409,
    slugTaken.json?.error ?? ''
  )

  const projectFieldCases = [
    ['项目名称为空被拒', await call('POST', '/api/admin/projects', { title: '   ' }), 400],
    ['stars 为负数被拒', await call('PATCH', `/api/admin/projects/${createdProject?.id}`, { stars: -1 }), 400],
    [
      '仓库地址非 http(s) 被拒（不给卡片挂脚本留口子）',
      await call('PATCH', `/api/admin/projects/${createdProject?.id}`, { repoUrl: 'javascript:alert(1)' }),
      400,
    ],
    ['项目状态只支持两态', await call('PATCH', `/api/admin/projects/${createdProject?.id}`, { status: 'trash' }), 400],
    ['空对象（没有可保存字段）被拒', await call('PATCH', `/api/admin/projects/${createdProject?.id}`, {}), 400],
    ['不存在的项目返回 404', await call('PATCH', '/api/admin/projects/99999999', { title: 'x' }), 404],
  ]
  for (const [name, res, want] of projectFieldCases) {
    assert(name, res.status === want, `HTTP ${res.status}${res.status !== want ? ` · ${res.json?.error}` : ''}`)
  }

  // 下架：前台项目列表必须立刻当它不存在
  const projectToDraft = await call('PATCH', `/api/admin/projects/${createdProject?.id}`, { status: 'draft' })
  const contentAfterDraft = await call('GET', '/api/content')
  assert(
    '项目下架后前台立刻看不到（未发布的项目不外泄）',
    projectToDraft.status === 200 &&
      !(contentAfterDraft.json?.projects ?? []).some((p) => p.slug === createdProject?.slug),
    `前台共 ${contentAfterDraft.json?.projects?.length ?? 0} 个项目`
  )

  // 清场：顺序还原、测试项目删掉
  await call('POST', '/api/admin/projects/reorder', { ids: orderBefore })
  const projectRemoved = await call('DELETE', `/api/admin/projects/${createdProject?.id}`)
  const projectsAfter = await call('GET', '/api/admin/projects')
  assert(
    '清理：测试项目已删除，计数回到初始值',
    projectRemoved.status === 200 &&
      projectRemoved.json?.deleted === true &&
      projectsAfter.json?.counts?.all === baseCounts?.all &&
      projectsAfter.json?.counts?.stars === baseCounts?.stars,
    `${projectsAfter.json?.counts?.all} 个项目 · 累计 ${projectsAfter.json?.counts?.starsLabel}`
  )

  /*
   * 15c. 首页内容区块。
   *
   * 这一屏是「后台改完前台立刻变」的典型：改的是前台正在渲染的那张表，
   * 中间没有第二份副本，所以闭环断言必须落在 `/api/content` 上 ——
   * 只看 PATCH 返回 200 是不够的，那只证明写进去了，没证明前台读得出来。
   */
  const sectionsBefore = await call('GET', '/api/admin/sections?module=home')
  const sectionItems = sectionsBefore.json?.items ?? []
  const heroSection = sectionItems.find((i) => i.key === 'hero')
  const aboutSection = sectionItems.find((i) => i.key === 'about')
  assert(
    '首页内容区块按模块返回（首屏 / 关于我 / 技术栈）',
    sectionsBefore.status === 200 && sectionItems.map((i) => i.key).join(',') === 'hero,about,stack',
    sectionItems.map((i) => i.key).join(', ') || '(空)'
  )
  assert(
    '区块带真实保存时间（预览卡的「上次保存」要有来源）',
    typeof heroSection?.updatedAt === 'string' && heroSection.updatedAt.length > 0,
    heroSection?.updatedAt ?? '(空)'
  )
  /*
   * 约束随包下发，界面才有依据画字数计数。上限若只写在前端，就会出现
   * 「界面上还能敲、保存却被拒」—— 两边都对，只是说的不是同一件事。
   */
  assert(
    '区块随包下发字段约束（界面计数与服务端校验同源）',
    heroSection?.fields?.name?.max === 20 && heroSection?.counters?.headline?.max === 60,
    `name.max=${heroSection?.fields?.name?.max} · headline.max=${heroSection?.counters?.headline?.max}`
  )

  const heroDoc = heroSection.data
  const aboutDoc = aboutSection.data
  const heroEdited = { ...heroDoc, name: '临时改名' }

  const sectionSaved = await call('PATCH', '/api/admin/sections/hero', heroEdited)
  assert(
    '保存首屏区块',
    sectionSaved.status === 200 && sectionSaved.json?.changed === true,
    `HTTP ${sectionSaved.status} ${sectionSaved.json?.error ?? ''}`
  )
  assert(
    '保存响应只回带真的改动字段（整份提交不当作全改）',
    JSON.stringify(sectionSaved.json?.fields) === '["中文名"]',
    JSON.stringify(sectionSaved.json?.fields)
  )

  const contentAfterSave = await call('GET', '/api/content')
  assert(
    '闭环：后台改完，前台 /api/content 立刻是新内容',
    contentAfterSave.json?.home?.hero?.name === '临时改名',
    `name=${contentAfterSave.json?.home?.hero?.name}`
  )
  assert(
    '前台仍按「中文名 · 拉丁名」两段返回（没有为了后台好写表单而合并字段）',
    contentAfterSave.json?.home?.hero?.latin === heroDoc.latin,
    `latin=${contentAfterSave.json?.home?.hero?.latin}`
  )

  const sectionRepeat = await call('PATCH', '/api/admin/sections/hero', heroEdited)
  assert(
    '值没变时不写库、不记日志',
    sectionRepeat.status === 200 && sectionRepeat.json?.changed === false,
    `changed=${sectionRepeat.json?.changed}`
  )

  /* 逐类非法输入：字段、嵌套字段、长度、必填、联合上限、协议、类型、列表 */
  const sectionBad = [
    ['未知区块键被拒', '/api/admin/sections/nope', {}],
    ['区块未知字段被拒', '/api/admin/sections/hero', { ...heroDoc, hacker: 1 }],
    ['嵌套层未知字段被拒', '/api/admin/sections/hero', { ...heroDoc, primaryAction: { label: 'a', to: '/x', evil: 1 } }],
    ['超长文本被拒', '/api/admin/sections/hero', { ...heroDoc, name: '一'.repeat(21) }],
    ['必填留空被拒', '/api/admin/sections/hero', { ...heroDoc, name: '   ' }],
    [
      '主标题联合上限被拒（中文名 + 拉丁名合计 61）',
      '/api/admin/sections/hero',
      { ...heroDoc, name: '一'.repeat(20), latin: 'a'.repeat(38) },
    ],
    [
      'javascript: 按钮链接被拒',
      '/api/admin/sections/hero',
      { ...heroDoc, primaryAction: { label: '点我', to: 'javascript:alert(1)' } },
    ],
    ['非站内非 http 的链接被拒', '/api/admin/sections/hero', { ...heroDoc, primaryAction: { label: '点我', to: 'www.x.com' } }],
    ['data: 配图地址被拒', '/api/admin/sections/hero', { ...heroDoc, image: 'data:text/html,x' }],
    ['开关非布尔值被拒', '/api/admin/sections/hero', { ...heroDoc, showImage: 'yes' }],
    [
      '列表超出条数上限被拒',
      '/api/admin/sections/about',
      { ...aboutDoc, skills: Array.from({ length: 25 }, (_, i) => `s${i}`) },
    ],
    [
      '条目含未知字段被拒',
      '/api/admin/sections/about',
      { ...aboutDoc, experience: [{ date: '2020', company: 'A', boss: 'x' }] },
    ],
    [
      '条目必填缺失被拒',
      '/api/admin/sections/about',
      { ...aboutDoc, experience: [{ date: '', company: 'A' }] },
    ],
    ['列表不是数组被拒', '/api/admin/sections/about', { ...aboutDoc, skills: 'Android' }],
    ['请求体是数组被拒', '/api/admin/sections/hero', []],
  ]
  for (const [name, path, body] of sectionBad) {
    const res = await call('PATCH', path, body)
    assert(name, res.status === 400, `${res.status} ${res.json?.error ?? ''}`)
  }

  const badModule = await call('GET', '/api/admin/sections?module=nope')
  assert('未知内容模块 400（而不是静默返回全部）', badModule.status === 400, `HTTP ${badModule.status}`)

  /*
   * JSON 写坏的请求体此前会一路落到统一错误处理里回 500 —— 「请求格式不对」看起来
   * 像服务端崩了，排查时会往服务端白找一圈。这条锁住它是 4xx。
   */
  const malformedBody = await call('PATCH', '/api/admin/sections/hero', 'x')
  assert('请求体写坏回 400 而不是 500', malformedBody.status === 400, `${malformedBody.status} ${malformedBody.json?.error ?? ''}`)

  const sectionNorm = await call('PATCH', '/api/admin/sections/about', { ...aboutDoc, strengths: ['留一条', '   ', ''] })
  assert(
    '列表里的空标签被丢弃而不是报错（清空一格再保存是常规操作）',
    sectionNorm.status === 200 && (sectionNorm.json?.data?.strengths ?? []).join() === '留一条',
    JSON.stringify(sectionNorm.json?.data?.strengths)
  )

  const sectionAudits = await call('GET', '/api/admin/audit-logs?range=0&perPage=100')
  const homeRows = (sectionAudits.json?.items ?? []).filter((l) => l.action === 'home_update')
  assert('首页内容保存写入 home_update 审计', homeRows.length > 0, homeRows[0]?.text ?? '(无)')
  assert(
    '审计只记真的改过的字段，且动作已翻译成人话',
    homeRows.some((l) => l.text === '更新首页内容 · 首屏 · 中文名' && l.actionKnown === true),
    homeRows.map((l) => l.text).slice(0, 2).join(' | ') || '(无)'
  )
  assert('区块审计的目标类型是 section', homeRows.every((l) => l.targetType === 'section'))

  const heroRestore = await call('PATCH', '/api/admin/sections/hero', heroDoc)
  const aboutRestore = await call('PATCH', '/api/admin/sections/about', aboutDoc)
  const restoredContent = await call('GET', '/api/content')
  assert(
    '清理：首页区块已还原，前台回到原值',
    heroRestore.status === 200 &&
      aboutRestore.status === 200 &&
      restoredContent.json?.home?.hero?.name === heroDoc.name &&
      (restoredContent.json?.home?.about?.strengths ?? []).length === aboutDoc.strengths.length,
    `name=${restoredContent.json?.home?.hero?.name} · strengths=${restoredContent.json?.home?.about?.strengths?.length}`
  )

  /*
   * 15d. 简历区块。
   *
   * 与首页那一屏的区别在于它多了两样这一屏独有的东西：**两层结构的列表**
   * （工作经历条目下既有一串要点、又挂着若干项目，项目自己也带要点）与
   * 一个**枚举顺序表**（模块结构：顺序 + 显示状态）。这两样都是新的校验分支，
   * 所以各来一组「合法的能过、非法的必须 400」，并各自验一次前台闭环。
   */
  const resumeSections = await call('GET', '/api/admin/sections?module=resume')
  const resumeItems = resumeSections.json?.items ?? []
  const summarySection = resumeItems.find((i) => i.key === 'resumeSummary')
  const expSection = resumeItems.find((i) => i.key === 'resumeExperience')
  const skillsSection = resumeItems.find((i) => i.key === 'resumeSkills')
  const contactSection = resumeItems.find((i) => i.key === 'resumeContact')
  const layoutSection = resumeItems.find((i) => i.key === 'resumeLayout')

  assert(
    '简历区块按模块返回（概要 / 工作经历 / 技能与教育 / 联系方式 / 模块结构）',
    resumeSections.status === 200 &&
      resumeItems.map((i) => i.key).join(',') ===
        'resumeSummary,resumeExperience,resumeSkills,resumeContact,resumeLayout',
    resumeItems.map((i) => i.key).join(', ') || '(空)'
  )
  assert(
    '「模块结构」只进侧栏面板，不进模块页签',
    layoutSection?.panelOnly === true &&
      resumeItems.filter((i) => i.panelOnly).length === 1,
    `panelOnly=${resumeItems.filter((i) => i.panelOnly).map((i) => i.key).join(',') || '(无)'}`
  )
  assert(
    '两层结构随包下发（经历条目里的嵌套项目与要点）',
    expSection?.lists?.jobs?.itemLists?.projects?.itemLists?.bullets?.type === 'chips',
    JSON.stringify(Object.keys(expSection?.lists?.jobs?.itemLists ?? {}))
  )

  const summaryDoc = summarySection.data
  const expDoc = expSection.data
  const skillsDoc = skillsSection.data
  const contactDoc = contactSection.data
  const layoutDoc = layoutSection.data

  /*
   * 库里没存过顺序也要给出完整的一份：空顺序表在前台等于「一节都不渲染」，
   * 那是最难查的一类「后台没动过、前台却少了东西」。
   */
  assert(
    '模块结构默认给全（还没保存过时也不返回空顺序）',
    Array.isArray(layoutDoc.order) && layoutDoc.order.length === 5,
    JSON.stringify(layoutDoc.order)
  )

  const skillsAsIs = await call('PATCH', '/api/admin/sections/resumeSkills', skillsDoc)
  assert(
    '现有技能行原样提交能通过（规格与线上内容不打架）',
    skillsAsIs.status === 200 && skillsAsIs.json?.changed === false,
    `HTTP ${skillsAsIs.status} ${skillsAsIs.json?.error ?? `changed=${skillsAsIs.json?.changed}`}`
  )

  const summaryEdited = { ...summaryDoc, description: '临时定位' }
  const summarySaved = await call('PATCH', '/api/admin/sections/resumeSummary', summaryEdited)
  assert(
    '保存简历概要',
    summarySaved.status === 200 && summarySaved.json?.changed === true,
    `HTTP ${summarySaved.status} ${summarySaved.json?.error ?? ''}`
  )
  assert(
    '简历概要保持「只记真改动」',
    JSON.stringify(summarySaved.json?.fields) === '["一行定位"]',
    JSON.stringify(summarySaved.json?.fields)
  )

  const contentAfterResume = await call('GET', '/api/content')
  assert(
    '闭环：后台改完，前台 /api/content 立刻是新简历定位',
    contentAfterResume.json?.resume?.description === '临时定位',
    `description=${contentAfterResume.json?.resume?.description}`
  )

  const tempJob = {
    date: '2099.01 — 2099.12',
    title: '临时公司 · 临时岗位',
    bullets: ['要点一'],
    projects: [{ name: '临时项目', bullets: ['子要点'] }],
  }
  const expSaved = await call('PATCH', '/api/admin/sections/resumeExperience', {
    ...expDoc,
    jobs: [...expDoc.jobs, tempJob],
  })
  assert(
    '保存两层结构的经历条目',
    expSaved.status === 200 && expSaved.json?.changed === true,
    `HTTP ${expSaved.status} ${expSaved.json?.error ?? ''}`
  )
  const contentAfterExp = await call('GET', '/api/content')
  const jobsAfterExp = contentAfterExp.json?.resume?.jobs ?? []
  assert(
    '闭环：条目里的嵌套项目与子要点都原样落到前台',
    jobsAfterExp.length === expDoc.jobs.length + 1 &&
      jobsAfterExp.at(-1)?.projects?.[0]?.bullets?.[0] === '子要点',
    `jobs=${jobsAfterExp.length} · 末条项目要点=${JSON.stringify(jobsAfterExp.at(-1)?.projects?.[0]?.bullets)}`
  )

  const reversedOrder = [...layoutDoc.order].reverse()
  const layoutSaved = await call('PATCH', '/api/admin/sections/resumeLayout', {
    order: reversedOrder,
    hidden: [],
  })
  assert(
    '保存模块顺序',
    layoutSaved.status === 200 && layoutSaved.json?.changed === true,
    `HTTP ${layoutSaved.status} ${layoutSaved.json?.error ?? ''}`
  )
  const contentAfterOrder = await call('GET', '/api/content')
  assert(
    '闭环：前台按新顺序下发正文小节',
    JSON.stringify(contentAfterOrder.json?.resume?.layout?.order) === JSON.stringify(reversedOrder),
    JSON.stringify(contentAfterOrder.json?.resume?.layout?.order)
  )

  const hiddenSaved = await call('PATCH', '/api/admin/sections/resumeLayout', {
    order: reversedOrder,
    hidden: ['education'],
  })
  const contentHidden = await call('GET', '/api/content')
  assert(
    '闭环：隐藏的小节前台拿得到标记（渲染与否由前台决定）',
    hiddenSaved.status === 200 &&
      JSON.stringify(contentHidden.json?.resume?.layout?.hidden) === '["education"]',
    JSON.stringify(contentHidden.json?.resume?.layout?.hidden)
  )

  const contactSaved = await call('PATCH', '/api/admin/sections/resumeContact', {
    ...contactDoc,
    pdfHint: !contactDoc.pdfHint,
  })
  const contentContact = await call('GET', '/api/content')
  assert(
    '闭环：关掉「PDF 索取提示」后前台拿到的 showPdfHint 跟着变',
    contactSaved.status === 200 && contentContact.json?.resume?.showPdfHint === !contactDoc.pdfHint,
    `showPdfHint=${contentContact.json?.resume?.showPdfHint}`
  )

  /* 逐类非法输入：嵌套字段、嵌套列表、枚举顺序表 */
  const resumeBad = [
    [
      '模块顺序少一项被拒（少一项前台就静默少一节）',
      '/api/admin/sections/resumeLayout',
      { order: layoutDoc.order.slice(0, 4), hidden: [] },
    ],
    [
      '模块顺序出现未知项被拒',
      '/api/admin/sections/resumeLayout',
      { order: [...layoutDoc.order.slice(0, 4), 'nope'], hidden: [] },
    ],
    [
      '模块顺序重复被拒',
      '/api/admin/sections/resumeLayout',
      { order: [layoutDoc.order[0], ...layoutDoc.order.slice(0, 4)], hidden: [] },
    ],
    [
      '隐藏列表出现未知项被拒',
      '/api/admin/sections/resumeLayout',
      { order: layoutDoc.order, hidden: ['nope'] },
    ],
    [
      '经历条目未知字段被拒',
      '/api/admin/sections/resumeExperience',
      { ...expDoc, jobs: [{ date: '2020', title: 'A', boss: 'x' }] },
    ],
    [
      '经历条目缺必填被拒',
      '/api/admin/sections/resumeExperience',
      { ...expDoc, jobs: [{ date: '', title: 'A' }] },
    ],
    [
      '嵌套项目出现未知字段被拒',
      '/api/admin/sections/resumeExperience',
      { ...expDoc, jobs: [{ date: '2020', title: 'A', projects: [{ name: 'P', evil: 1 }] }] },
    ],
    [
      '嵌套项目缺项目名被拒',
      '/api/admin/sections/resumeExperience',
      { ...expDoc, jobs: [{ date: '2020', title: 'A', projects: [{ name: '  ' }] }] },
    ],
    [
      '嵌套要点不是数组被拒',
      '/api/admin/sections/resumeExperience',
      { ...expDoc, jobs: [{ date: '2020', title: 'A', bullets: '一条' }] },
    ],
    [
      '嵌套要点超长被拒',
      '/api/admin/sections/resumeExperience',
      { ...expDoc, jobs: [{ date: '2020', title: 'A', bullets: ['一'.repeat(241)] }] },
    ],
    [
      '技能行缺分类名被拒',
      '/api/admin/sections/resumeSkills',
      { ...skillsDoc, rows: [{ label: '', value: 'x' }] },
    ],
    [
      '简历开关非布尔值被拒',
      '/api/admin/sections/resumeContact',
      { ...contactDoc, pdfHint: 'yes' },
    ],
  ]
  for (const [name, path, body] of resumeBad) {
    const res = await call('PATCH', path, body)
    assert(name, res.status === 400, `${res.status} ${res.json?.error ?? ''}`)
  }

  const resumeAudits = await call('GET', '/api/admin/audit-logs?range=0&perPage=200')
  const resumeRows = (resumeAudits.json?.items ?? []).filter((l) => l.action === 'resume_save')
  assert('简历保存写入 resume_save 审计', resumeRows.length > 0, resumeRows[0]?.text ?? '(无)')
  assert(
    '简历审计的动作已翻译成人话，且只记真改动',
    resumeRows.some((l) => l.text === '更新简历 · 概要 · 一行定位' && l.actionKnown === true),
    resumeRows.map((l) => l.text).slice(0, 3).join(' | ') || '(无)'
  )
  assert('简历区块审计的目标类型是 section', resumeRows.every((l) => l.targetType === 'section'))

  const summaryRestore = await call('PATCH', '/api/admin/sections/resumeSummary', summaryDoc)
  const expRestore = await call('PATCH', '/api/admin/sections/resumeExperience', expDoc)
  const layoutRestore = await call('PATCH', '/api/admin/sections/resumeLayout', layoutDoc)
  const contactRestore = await call('PATCH', '/api/admin/sections/resumeContact', contactDoc)
  const restoredResume = await call('GET', '/api/content')
  assert(
    '清理：简历区块已还原，前台回到原值',
    summaryRestore.status === 200 &&
      expRestore.status === 200 &&
      layoutRestore.status === 200 &&
      contactRestore.status === 200 &&
      restoredResume.json?.resume?.description === summaryDoc.description &&
      restoredResume.json?.resume?.jobs?.length === expDoc.jobs.length &&
      JSON.stringify(restoredResume.json?.resume?.layout?.order) === JSON.stringify(layoutDoc.order) &&
      (restoredResume.json?.resume?.layout?.hidden ?? []).length === 0,
    `description=${restoredResume.json?.resume?.description} · jobs=${restoredResume.json?.resume?.jobs?.length} · order=${JSON.stringify(restoredResume.json?.resume?.layout?.order)}`
  )

  /*
   * 15e. 媒体库。
   *
   * 这一段的删除用例**只作用于自己刚上传的临时文件**：种子里的图是随构建产物
   * 发布的源文件，冒烟测试把它们删掉是不可逆的。被引用时的那条路径（409）反过来
   * 正好要拿种子图来测 —— 它不产生删除，只产生一条被拦下的审计。
   *
   * 上传走原始体而不是 multipart，所以这里不能复用 `call`（它只发 JSON）。
   */
  const mediaList = await call('GET', '/api/admin/media')
  const mediaSeed = mediaList.json?.items ?? []
  assert(
    '媒体库列表返回种子里的 2 个文件，且计数来自真实分组',
    mediaList.status === 200 &&
      mediaSeed.length === 2 &&
      mediaList.json?.counts?.all === 2 &&
      mediaList.json?.counts?.image === 2 &&
      mediaList.json?.counts?.icon === 0 &&
      mediaList.json?.counts?.doc === 0,
    `all=${mediaList.json?.counts?.all} image=${mediaList.json?.counts?.image} icon=${mediaList.json?.counts?.icon} doc=${mediaList.json?.counts?.doc}`
  )
  assert(
    '体积与尺寸是现场读出来的，不是库里的缓存值',
    mediaSeed.every((m) => m.bytes > 0 && Number.isInteger(m.width) && Number.isInteger(m.height)) &&
      mediaList.json?.bytes > 0 &&
      mediaSeed.every((m) => m.missing === false),
    `${mediaList.json?.totalLabel} · 例：${mediaSeed[0]?.filename} ${mediaSeed[0]?.width}×${mediaSeed[0]?.height} ${mediaSeed[0]?.bytesLabel}`
  )
  assert(
    '每张图的引用关系都是现扫出来的',
    /*
     * 原先还有第三条样本：`post-adb.png` 被文章 4 的封面引用，用来覆盖
     * 「引用来自 posts.cover_image」这条路。六张文章封面图移出后，文章侧不再引用
     * 任何图，这条样本随之消失 —— 覆盖少了一维，如实记在这里而不是留一条假断言。
     * 剩下的两条仍然证明是「现扫」而非读缓存：portrait 来自 settings（头像格
     * 式串），hero-workspace 同时被多处引用。
     */
    mediaSeed.some((m) => m.filename === 'portrait.png' && m.references?.some((r) => r.type === 'settings')) &&
      mediaSeed.some((m) => m.filename === 'hero-workspace.png' && m.referenceCount >= 2),
    mediaSeed.map((m) => `${m.filename}:${m.referenceCount}`).join(' ')
  )
  assert(
    '上传策略随列表下发（白名单 / 上限 / 替代文本上限都来自服务端）',
    typeof mediaList.json?.policy?.accept === 'string' &&
      mediaList.json.policy.accept.includes('image/png') &&
      mediaList.json.policy.maxBytes === 5 * 1024 * 1024 &&
      mediaList.json.policy.maxAlt === 120 &&
      typeof mediaList.json.policy.hint === 'string',
    JSON.stringify(mediaList.json?.policy)
  )

  const mediaFiltered = await call('GET', '/api/admin/media?kind=icon')
  assert(
    '按分组筛选：目前没有任何图标，所以结果是空列表而不是全量',
    mediaFiltered.status === 200 && (mediaFiltered.json?.items ?? []).length === 0,
    `items=${(mediaFiltered.json?.items ?? []).length}`
  )
  /*
   * 排序口径必须与显示口径一致。
   *
   * 这条是浏览器核对抓出来的回归：此前「按大小」下推给 SQL 的 `bytes` 列，而那一列
   * 对种子行是 0（显示的大小是现场从磁盘读的），于是点「按大小」看着像没反应。
   * 断言落在「字节数真的单调不增」上，而不是「接口回显了 sort=size」——
   * 后者在排序没生效时照样能过。
   */
  const mediaBySize = await call('GET', '/api/admin/media?sort=size')
  const sizeSeq = (mediaBySize.json?.items ?? []).map((m) => m.bytes)
  assert(
    '按大小排序真的按显示出来的字节数排（不是那一列全 0 的缓存值）',
    mediaBySize.status === 200 &&
      sizeSeq.length === 2 &&
      sizeSeq.every((n, i) => i === 0 || sizeSeq[i - 1] >= n) &&
      mediaBySize.json?.items?.[0]?.filename === 'hero-workspace.png',
    sizeSeq.join(' ≥ ') || '(空)'
  )
  const mediaByName = await call('GET', '/api/admin/media?sort=name')
  const nameSeq = (mediaByName.json?.items ?? []).map((m) => m.filename)
  assert(
    '按文件名排序是字典序',
    nameSeq.length === 2 && nameSeq[0] === 'hero-workspace.png' && nameSeq.at(-1) === 'portrait.png',
    nameSeq.join(' < ')
  )
  const mediaBadSort = await call('GET', '/api/admin/media?sort=whatever')
  assert(
    '未知排序回退到默认，而不是 500 或空列表',
    mediaBadSort.status === 200 && mediaBadSort.json?.sort === 'recent' && (mediaBadSort.json?.items ?? []).length === 2,
    `sort=${mediaBadSort.json?.sort}`
  )

  const mediaBadKind = await call('GET', '/api/admin/media?kind=video')
  assert('未知的媒体分组返回 400', mediaBadKind.status === 400, mediaBadKind.json?.error ?? '')
  const mediaGuarded = await fetch(`${BASE}/api/admin/media`)
  assert('未登录访问媒体库返回 401', mediaGuarded.status === 401)

  /** 原始体上传：文件名进请求头，类型走 Content-Type —— 与服务端 express.raw 的分流口径一致。 */
  const uploadRaw = async (path, mime, name, bytes) => {
    const body = bytes ?? (await import('node:fs')).readFileSync(new URL(path, import.meta.url))
    const res = await fetch(`${BASE}/api/admin/media`, {
      method: 'POST',
      headers: {
        'Content-Type': mime,
        'X-Upload-Name': encodeURIComponent(name),
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body,
    })
    const text = await res.text()
    let json = null
    try {
      json = text ? JSON.parse(text) : null
    } catch {
      /* 保留原文 */
    }
    return { status: res.status, json, text }
  }

  const upPng = await uploadRaw('../public/images/portrait.png', 'image/png', '冒烟测试封面.png')
  assert(
    '上传 PNG 成功，落盘名是 ASCII 短名（中文名会被削光，所以必须有兜底）',
    upPng.status === 201 &&
      /^[a-z0-9-]+-[0-9a-f]{6}\.png$/.test(upPng.json?.item?.filename ?? '') &&
      upPng.json?.item?.url?.startsWith('/uploads/') &&
      upPng.json?.item?.bytes > 0 &&
      /* 按种子项数相对断言，而不是写死数字 —— 种子增减时不必再回来改这里 */
      upPng.json?.counts?.all === mediaSeed.length + 1,
    `${upPng.json?.item?.filename} · ${upPng.json?.item?.bytesLabel} · all=${upPng.json?.counts?.all}`
  )
  assert(
    '替代文本预填成原名（去掉扩展名），拖完就能用',
    upPng.json?.item?.alt === '冒烟测试封面',
    upPng.json?.item?.alt ?? ''
  )
  const upId = upPng.json?.item?.id
  const upName = upPng.json?.item?.filename

  const upSvg = await uploadRaw(
    '../public/images/portrait.png',
    'image/svg+xml',
    '图标.svg',
    Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><rect width="24" height="24" fill="#F67B1B"/></svg>')
  )
  assert(
    '上传 SVG 归入「图标」分组，且扩展名取自 MIME 而不是客户端给的文件名',
    upSvg.status === 201 &&
      upSvg.json?.item?.kind === 'icon' &&
      upSvg.json?.item?.filename.endsWith('.svg') &&
      upSvg.json?.counts?.icon === 1,
    `${upSvg.json?.item?.filename} kind=${upSvg.json?.item?.kind} icon=${upSvg.json?.counts?.icon}`
  )
  const upSvgId = upSvg.json?.item?.id

  const upBad = await uploadRaw('../public/images/portrait.png', 'text/html', 'x.html')
  assert(
    '白名单之外的类型一律拒收（不落盘、不入库）',
    upBad.status === 400 && (upBad.json?.error ?? '').includes('不支持的类型'),
    upBad.json?.error ?? ''
  )
  const upEmpty = await uploadRaw('../public/images/portrait.png', 'image/png', 'empty.png', Buffer.alloc(0))
  assert('空文件被拒', upEmpty.status === 400, upEmpty.json?.error ?? '')
  const upBig = await uploadRaw('', 'image/png', 'big.png', Buffer.alloc(6 * 1024 * 1024, 1))
  assert('超过 5MB 的上传被 413 拦下', upBig.status === 413, `HTTP ${upBig.status}`)

  const mediaFile = await fetch(`${BASE}${upPng.json?.item?.url}`)
  const mediaFileCsp = mediaFile.headers.get('content-security-policy') ?? ''
  assert(
    '上传的文件可直接访问，且带 no-sniff 与沙箱 CSP（否则 SVG 就是同源 XSS 落点）',
    mediaFile.status === 200 &&
      mediaFile.headers.get('content-type') === 'image/png' &&
      mediaFile.headers.get('x-content-type-options') === 'nosniff' &&
      mediaFileCsp.includes("default-src 'none'"),
    `HTTP ${mediaFile.status} · ${mediaFile.headers.get('content-type')} · CSP=${mediaFileCsp.slice(0, 48) || '(无)'}`
  )

  const altSave = await call('PATCH', `/api/admin/media/${upId}`, { alt: '改过的替代文本' })
  assert(
    '改替代文本成功回写',
    altSave.status === 200 && altSave.json?.changed === true && altSave.json?.item?.alt === '改过的替代文本',
    altSave.json?.item?.alt ?? ''
  )
  const altNoop = await call('PATCH', `/api/admin/media/${upId}`, { alt: '改过的替代文本' })
  assert('同一个值重保存不产生变更', altNoop.status === 200 && altNoop.json?.changed === false)

  const renameTry = await call('PATCH', `/api/admin/media/${upId}`, { filename: 'new.png' })
  assert(
    '文件名不可改：它是磁盘路径与所有引用的锚点，接口直接拒收而不是静默忽略',
    renameTry.status === 400 && (renameTry.json?.error ?? '').includes('文件名与地址不可修改'),
    renameTry.json?.error ?? ''
  )
  const altTooLong = await call('PATCH', `/api/admin/media/${upId}`, { alt: 'x'.repeat(121) })
  assert('替代文本超长返回 400', altTooLong.status === 400, altTooLong.json?.error ?? '')
  const mediaNotFound = await call('PATCH', '/api/admin/media/999999', { alt: 'x' })
  assert('改不存在的媒体返回 404', mediaNotFound.status === 404, mediaNotFound.json?.error ?? '')

  const referenced = mediaSeed.find((m) => m.filename === 'portrait.png')
  const delBlocked = await call('DELETE', `/api/admin/media/${referenced?.id}`)
  assert(
    '被引用时默认拒删，并把引用清单原样带回',
    delBlocked.status === 409 &&
      (delBlocked.json?.references ?? []).length > 0 &&
      delBlocked.json?.references?.[0]?.href,
    `${delBlocked.json?.error} → ${(delBlocked.json?.references ?? []).map((r) => r.label).join('、')}`
  )
  const stillThere = await call('GET', '/api/admin/media')
  assert(
    '被拦下的删除没有产生任何副作用（行还在、盘上文件还在）',
    (stillThere.json?.items ?? []).some((m) => m.filename === 'portrait.png' && m.missing === false)
  )

  const delPng = await call('DELETE', `/api/admin/media/${upId}`)
  /*
   * 这条依赖服务端进程对其上传目录（`data/uploads`）有删除权限。跑在只读或受限
   * 环境里时 `fileRemoved` 会恒为 false、临时文件留在 uploads —— 那是环境限制，
   * 不是删除逻辑坏了：`diskPathOf` 能算出正确路径，换个有权限的进程 unlink 同一
   * 文件即可成功。判断前先看这一点，别去改删除实现。
   */
  assert(
    '删除自己上传的文件：行与磁盘文件一起清掉',
    delPng.status === 200 && delPng.json?.deleted === true && delPng.json?.fileRemoved === true && delPng.json?.counts?.all === mediaSeed.length + 1,
    `fileRemoved=${delPng.json?.fileRemoved} all=${delPng.json?.counts?.all}`
  )
  const delSvg = await call('DELETE', `/api/admin/media/${upSvgId}`)
  const afterClean = await call('GET', '/api/admin/media')
  assert(
    `清理：临时文件删净，媒体库回到种子的 ${mediaSeed.length} 项`,
    delSvg.status === 200 &&
      afterClean.json?.counts?.all === mediaSeed.length &&
      afterClean.json?.counts?.icon === 0 &&
      !(afterClean.json?.items ?? []).some((m) => m.filename === upName),
    `all=${afterClean.json?.counts?.all} icon=${afterClean.json?.counts?.icon}`
  )

  const mediaAudits = await call('GET', '/api/admin/audit-logs?range=0&perPage=200')
  const mediaRows = (mediaAudits.json?.items ?? []).filter((l) => (l.action ?? '').startsWith('media_'))
  const seenMediaActions = new Set(mediaRows.map((l) => l.action))
  assert(
    '上传 / 改信息 / 删除三个动作都写了审计',
    ['media_upload', 'media_update', 'media_delete'].every((a) => seenMediaActions.has(a)),
    `已记录：${[...seenMediaActions].join(', ') || '(空)'}`
  )
  assert(
    '媒体动作在日志页都翻译成了中文（没有未登记的动作码）',
    mediaRows.length > 0 && mediaRows.every((l) => l.actionKnown === true && /^[\u4e00-\u9fa5]/.test(l.text ?? '')),
    mediaRows.map((l) => l.text).slice(0, 3).join(' · ') || '(空)'
  )
  assert(
    '被拦下的删除以失败结果入日志，而不是静默丢弃',
    mediaRows.some((l) => l.action === 'media_delete' && l.result === 'failed'),
    mediaRows.find((l) => l.action === 'media_delete')?.text ?? '(无)'
  )
  assert(
    '媒体审计的目标类型是 media（不是 section，也不是 post）',
    mediaRows.every((l) => l.targetType === 'media')
  )

  /*
   * 15f. 分类与标签。
   *
   * 这一段锁的是两者**数据结构不同带来的行为差异**，不是把增删改各跑一遍：
   *   1. 分类名直接存在 `posts.category` 上（不是外键），所以**改名是连带写入** ——
   *      只改 `categories.name` 会让前台筛选条多出一个空分类，老文章全掉进「未分类」；
   *   2. 分类挂着文章时**拒删**并带回清单，`force` 才解绑；标签反过来，
   *      删除只解关联，文章一篇不动；
   *   3. 顺序是分类独有的（标签按频次算，不能拖），改完前台筛选条当场换序；
   *   4. 近重复两边规矩不同：分类**在入口拦下**，标签**放行但给出合并入口** ——
   *      差别不在重要性，而在分类没有合并入口、且名字会被写进文章。
   *
   * 全程用自己新建的分类 / 标签 / 草稿做实验，结尾一律清干净。
   */
  const tax0 = await call('GET', '/api/admin/taxonomy')
  const seedCats = tax0.json?.categories ?? []
  const seedTags = tax0.json?.tags ?? []
  assert(
    '一次取回分类、标签、策略与计数（拆成两个请求会让两块面板在刷新瞬间互相矛盾）',
    tax0.status === 200 &&
      seedCats.length === tax0.json?.counts?.categories &&
      seedTags.length === tax0.json?.counts?.tags &&
      seedCats.length === 5 &&
      ['Android', '前端工程', '自托管', '工具链', '设计工程'].every((n) => seedCats.some((c) => c.name === n)),
    `分类 ${seedCats.length} 个 · 标签 ${seedTags.length} 个（含第 15 步留下的未使用标签「冒烟测试」）`
  )
  assert(
    '名称上限随列表下发 —— 界面上「{n} / 24」那个计数器与服务端同一份，不存在第二处写死',
    tax0.json?.policy?.categoryNameMax === 24 && tax0.json?.policy?.tagNameMax === 24,
    JSON.stringify(tax0.json?.policy)
  )
  assert(
    '标签按使用频次降序（没有 sort_order，顺序是算出来的，不是存的）',
    seedTags.every((t, i) => i === 0 || seedTags[i - 1].postCount >= t.postCount) &&
      seedTags.every((t) => Number.isInteger(t.postCount)),
    seedTags.map((t) => `${t.name}:${t.postCount}`).join(' ')
  )
  assert(
    '未使用标签数是现算的（「清理未使用标签」据此置灰，而不是点下去才发现没事可做）',
    tax0.json?.counts?.unusedTags === seedTags.filter((t) => t.postCount === 0).length,
    `unusedTags=${tax0.json?.counts?.unusedTags}`
  )

  /* 顺序：改完 sort_order，前台筛选条必须当场换序 —— 这是「分类有顺序」的全部意义 */
  const catOrder = seedCats.map((c) => c.id)
  const catNames = seedCats.map((c) => c.name)
  const reorder = await call('POST', '/api/admin/categories/reorder', { ids: [...catOrder].reverse() })
  const frontAfterReorder = await call('GET', '/api/content')
  assert(
    '排序整份提交：前台筛选条当场按新顺序排列',
    reorder.status === 200 &&
      reorder.json?.reordered === catOrder.length &&
      (frontAfterReorder.json?.filters?.blog ?? []).slice(1).join(',') === [...catNames].reverse().join(','),
    `筛选条 ${(frontAfterReorder.json?.filters?.blog ?? []).slice(1).join(' / ')}`
  )
  const badReorder = await call('POST', '/api/admin/categories/reorder', { ids: catOrder.slice(0, 2) })
  assert(
    '只提交一部分 ID 会被拒（长度必须对得上，否则顺序会静默错位）',
    badReorder.status === 400,
    badReorder.json?.error ?? ''
  )
  const restoreOrder = await call('POST', '/api/admin/categories/reorder', { ids: catOrder })
  const frontAfterRestore = await call('GET', '/api/content')
  assert(
    '清理：顺序已还原',
    restoreOrder.status === 200 &&
      (frontAfterRestore.json?.filters?.blog ?? []).slice(1).join(',') === catNames.join(','),
    `筛选条 ${(frontAfterRestore.json?.filters?.blog ?? []).slice(1).join(' / ')}`
  )

  /* 新建分类：同名与近重复都拦，超长与空名也拦 */
  const catName = `冒烟分类${stamp}`
  const catNew = await call('POST', '/api/admin/categories', { name: catName })
  const catId = catNew.json?.item?.id
  assert(
    '新建分类返回 201，并把新计数一起带回来',
    catNew.status === 201 && catNew.json?.item?.name === catName && catNew.json?.counts?.categories === 6,
    `id=${catId} · 分类 ${catNew.json?.counts?.categories} 个`
  )
  const catDup = await call('POST', '/api/admin/categories', { name: catName })
  assert('同名分类被拒（库里 name 是 UNIQUE，这里应当 400）', catDup.status === 400, catDup.json?.error ?? '')
  const catNear = await call('POST', '/api/admin/categories', { name: `冒烟 分类${stamp}` })
  assert(
    '分类连近重复也拦，并且指出已经存在的那一个（它没有合并入口，且名字会被写进文章）',
    catNear.status === 400 && (catNear.json?.error ?? '').includes('已有分类'),
    catNear.json?.error ?? ''
  )
  const catLong = await call('POST', '/api/admin/categories', { name: '分'.repeat(25) })
  const catEmpty = await call('POST', '/api/admin/categories', { name: '   ' })
  assert(
    '超长与空名的分类被拒（上限 24 与界面同源）',
    catLong.status === 400 && catEmpty.status === 400,
    `${catLong.json?.error ?? ''} / ${catEmpty.json?.error ?? ''}`
  )

  /* 改名是连带写入：用一篇临时草稿挂在新建的分类下，看它有没有跟着改 */
  const p1 = await call('POST', '/api/admin/posts', { title: `冒烟·分类改名 ${stamp}`, category: catName })
  const p1Id = p1.json?.post?.id
  assert(
    '草稿可以挂到新建的分类上',
    p1.status === 201 && p1.json?.post?.category === catName,
    `id=${p1Id} category=${p1.json?.post?.category}`
  )
  const renamedCat = `${catName}改名`
  const catRename = await call('PATCH', `/api/admin/categories/${catId}`, { name: renamedCat })
  const p1AfterRename = await call('GET', `/api/admin/posts/${p1Id}`)
  const frontAfterRename = await call('GET', '/api/content')
  assert(
    '重命名分类连带改文章：回执带 movedPosts，文章的 category 一起变',
    catRename.status === 200 &&
      catRename.json?.changed === true &&
      catRename.json?.movedPosts === 1 &&
      p1AfterRename.json?.post?.category === renamedCat,
    `movedPosts=${catRename.json?.movedPosts} · 文章分类=${p1AfterRename.json?.post?.category}`
  )
  assert(
    '前台筛选条跟着改名（不是只改了后台那一行）',
    (frontAfterRename.json?.filters?.blog ?? []).includes(renamedCat) &&
      !(frontAfterRename.json?.filters?.blog ?? []).includes(catName),
    (frontAfterRename.json?.filters?.blog ?? []).slice(1).join(' / ')
  )

  /* 删除：挂着文章先拒，force 才解绑 */
  const catDelBlocked = await call('DELETE', `/api/admin/categories/${catId}`)
  assert(
    '分类挂着文章时默认拒删，并把文章清单原样带回',
    catDelBlocked.status === 409 &&
      (catDelBlocked.json?.posts ?? []).length === 1 &&
      catDelBlocked.json?.posts?.[0]?.id === p1Id,
    `${catDelBlocked.json?.error} → ${(catDelBlocked.json?.posts ?? []).map((p) => p.title).join('、')}`
  )
  const catStillThere = await call('GET', '/api/admin/taxonomy')
  assert(
    '被拒的删除没有产生任何副作用（分类还在，文章的分类也没被清空）',
    (catStillThere.json?.categories ?? []).some((c) => c.id === catId) &&
      (catStillThere.json?.counts?.uncategorized ?? 0) === 0
  )
  const catDelForced = await call('DELETE', `/api/admin/categories/${catId}?force=1`)
  const p1AfterUnbind = await call('GET', `/api/admin/posts/${p1Id}`)
  assert(
    'force 删除分类：解绑而不是连带删文章，文章落到「未分类」',
    catDelForced.status === 200 &&
      catDelForced.json?.deleted === true &&
      catDelForced.json?.unbound === 1 &&
      p1AfterUnbind.json?.post?.category === '' &&
      catDelForced.json?.counts?.uncategorized === 1,
    `unbound=${catDelForced.json?.unbound} · uncategorized=${catDelForced.json?.counts?.uncategorized}`
  )

  /* ------------------------------------------------------------------ 标签 */
  const tagName = `冒烟标签${stamp}`
  const tagNew = await call('POST', '/api/admin/tags', { name: tagName })
  const tagId = tagNew.json?.item?.id
  assert(
    '新建标签返回 201，并把新计数一起带回来',
    tagNew.status === 201 && tagNew.json?.item?.name === tagName && tagNew.json?.counts?.tags === seedTags.length + 1,
    `id=${tagId} · 标签 ${tagNew.json?.counts?.tags} 个`
  )
  const tagDup = await call('POST', '/api/admin/tags', { name: tagName })
  assert('同名标签被拒（与分类一样，库里 name 是 UNIQUE）', tagDup.status === 400, tagDup.json?.error ?? '')
  const nearName = `冒烟 标签${stamp}`
  const tagNear = await call('POST', '/api/admin/tags', { name: nearName })
  assert(
    '近重复标签**放行** —— 拦不住（文章编辑器也会顺手建标签），所以让它看得见、能收拾',
    tagNear.status === 201 && (await call('GET', '/api/admin/taxonomy')).json?.mergeGroups?.length >= 1,
    `已建「${nearName}」`
  )
  const tagLong = await call('POST', '/api/admin/tags', { name: '标'.repeat(25) })
  assert('超长标签被拒', tagLong.status === 400, tagLong.json?.error ?? '')

  /*
   * 合并：让「要被丢掉的那一个」真的挂着文章。
   * 只断言「merged > 0」会漏掉最要命的一种坏 —— 标签删了，文章的关联没搬过去。
   */
  const p2 = await call('POST', '/api/admin/posts', { title: `冒烟·标签合并 ${stamp}`, tags: [nearName] })
  const p2Id = p2.json?.post?.id
  const p1Tagged = await call('PATCH', `/api/admin/posts/${p1Id}`, { tags: [tagName] })
  const taxBeforeMerge = await call('GET', '/api/admin/taxonomy')
  const mergeGroup = (taxBeforeMerge.json?.mergeGroups ?? []).find((g) => g.keeper?.id === tagId)
  assert(
    '近重复分组由服务端现算：保留者是用得多的那一个，并给出一句话',
    Boolean(mergeGroup) &&
      mergeGroup.drop?.length === 1 &&
      typeof mergeGroup.text === 'string' &&
      mergeGroup.text.includes(tagName),
    mergeGroup?.text ?? '(未找到分组)'
  )
  const merged = await call('POST', '/api/admin/tags/merge')
  const p2AfterMerge = await call('GET', `/api/admin/posts/${p2Id}`)
  assert(
    '合并真的把文章的关联搬到保留者身上（movedPosts 就是被搬走的行数）',
    merged.status === 200 &&
      merged.json?.merged >= 1 &&
      merged.json?.movedPosts === 1 &&
      (p2AfterMerge.json?.post?.tags ?? []).includes(tagName) &&
      !(p2AfterMerge.json?.post?.tags ?? []).some((t) => t === nearName),
    `merged=${merged.json?.merged} movedPosts=${merged.json?.movedPosts} · 文章标签=${(p2AfterMerge.json?.post?.tags ?? []).join(' / ')}`
  )
  const taxAfterMerge = await call('GET', '/api/admin/taxonomy')
  assert(
    '合并后被丢掉的那个标签不存在了，文章一篇没少',
    !(taxAfterMerge.json?.tags ?? []).some((t) => t.name === nearName) &&
      (taxAfterMerge.json?.tags ?? []).some((t) => t.id === tagId) &&
      taxAfterMerge.json?.mergeGroups?.length === 0,
    `标签 ${taxAfterMerge.json?.counts?.tags} 个 · 近重复组 ${taxAfterMerge.json?.mergeGroups?.length} 组`
  )
  const mergeTwice = await call('POST', '/api/admin/tags/merge')
  assert(
    '没有近重复时合并是空操作（如实返回 0，且不写审计）',
    mergeTwice.status === 200 && mergeTwice.json?.merged === 0,
    `merged=${mergeTwice.json?.merged}`
  )

  const tagRenamed = await call('PATCH', `/api/admin/tags/${tagId}`, { name: `${tagName}改名` })
  const p2AfterTagRename = await call('GET', `/api/admin/posts/${p2Id}`)
  assert(
    '标签改名不动关联（关联是按 id 的，与分类改名的连带写入正好相反）',
    tagRenamed.status === 200 &&
      tagRenamed.json?.changed === true &&
      (p2AfterTagRename.json?.post?.tags ?? []).includes(`${tagName}改名`),
    `文章标签=${(p2AfterTagRename.json?.post?.tags ?? []).join(' / ')}`
  )
  const tagDupRename = await call('PATCH', `/api/admin/tags/${tagId}`, { name: 'adb' })
  assert('标签改名为已存在的名字返回 400', tagDupRename.status === 400, tagDupRename.json?.error ?? '')

  /* 清理未使用标签：幂等，且只删 0 篇的 */
  const pruned = await call('POST', '/api/admin/tags/prune-unused')
  assert(
    '清理未使用标签：删掉的正是 0 篇的那些（本轮至少是第 15 步留下的「冒烟测试」）',
    pruned.status === 200 &&
      pruned.json?.removed >= 1 &&
      (pruned.json?.names ?? []).length === pruned.json?.removed,
    pruned.json?.names?.join('、') ?? '(空)'
  )
  const prunedAgain = await call('POST', '/api/admin/tags/prune-unused')
  assert(
    '再清理一次是空操作（removed=0，不假装做了事）',
    prunedAgain.status === 200 && prunedAgain.json?.removed === 0
  )

  const tagDel = await call('DELETE', `/api/admin/tags/${tagId}`)
  const postsAfterTagDel = await call('GET', '/api/admin/posts?perPage=50')
  assert(
    '删除标签只解关联，文章一篇不动',
    tagDel.status === 200 &&
      tagDel.json?.deleted === true &&
      tagDel.json?.unbound === 2 &&
      (postsAfterTagDel.json?.items ?? []).some((p) => p.id === p1Id) &&
      (postsAfterTagDel.json?.items ?? []).some((p) => p.id === p2Id),
    `unbound=${tagDel.json?.unbound}`
  )

  /* 清场：临时草稿删掉，库回到这一轮之前的状态 */
  for (const id of [p1Id, p2Id]) {
    await call('PATCH', `/api/admin/posts/${id}`, { status: 'trash' })
    await call('DELETE', `/api/admin/posts/${id}`)
  }
  const taxClean = await call('GET', '/api/admin/taxonomy')
  assert(
    '清理：分类回到 5 个、未分类 0 篇、没有残留的近重复组',
    taxClean.status === 200 &&
      taxClean.json?.counts?.categories === 5 &&
      taxClean.json?.counts?.uncategorized === 0 &&
      taxClean.json?.mergeGroups?.length === 0,
    `分类 ${taxClean.json?.counts?.categories} 个 · 标签 ${taxClean.json?.counts?.tags} 个 · 未分类 ${taxClean.json?.counts?.uncategorized} 篇`
  )

  const taxAudits = await call('GET', '/api/admin/audit-logs?range=0&perPage=200')
  const taxRows = (taxAudits.json?.items ?? []).filter((l) => /^(category_|tag_)/.test(l.action ?? ''))
  const taxActions = new Set(taxRows.map((l) => l.action))
  assert(
    '分类与标签的每个写动作都落了审计（重命名与其他动作分开记）',
    ['category_create', 'category_update', 'category_reorder', 'category_delete', 'tag_create', 'tag_rename', 'tag_delete', 'tag_prune'].every(
      (a) => taxActions.has(a)
    ),
    `已记录：${[...taxActions].join(', ') || '(空)'}`
  )
  assert(
    '这些动作在日志页都翻译成了中文（没有未登记的动作码）',
    taxRows.length > 0 && taxRows.every((l) => l.actionKnown === true && /^[\u4e00-\u9fa5]/.test(l.text ?? '')),
    taxRows.map((l) => l.text).slice(0, 3).join(' · ') || '(空)'
  )
  assert(
    '被拒的两条（近重复分类、挂着文章的分类）以失败结果入日志',
    taxRows.some((l) => l.action === 'category_create' && l.result === 'failed') &&
      taxRows.some((l) => l.action === 'category_delete' && l.result === 'failed'),
    taxRows.filter((l) => l.result === 'failed').map((l) => l.text).slice(0, 2).join(' · ') || '(无)'
  )
  assert(
    '审计的目标类型是 category / tag，不是 post',
    taxRows.every((l) => l.targetType === 'category' || l.targetType === 'tag')
  )

  // 16. 写操作必须落审计
  const audits = await call('GET', '/api/admin/audit-logs?range=0&perPage=100')
  const auditActions = (audits.json?.items ?? []).map((l) => l.action)
  assert(
    '文章状态变更已写入审计日志',
    auditActions.includes('post_status'),
    `HTTP ${audits.status} · 共 ${audits.json?.total ?? '-'} 条 · 动作：${[...new Set(auditActions)].slice(0, 6).join(', ') || '(空)'}`
  )
  /*
   * 内容保存与状态流转是**两个动作码**（`post_save` / `post_status`）。
   * 这条同时锁住「编辑器真的写了审计」以及「两条路径没有合成一条」—— 合成一条之后
   * 操作日志里就分不清「改了正文」和「只是发布了一下」。
   */
  const saveRows = (audits.json?.items ?? []).filter((l) => l.action === 'post_save')
  assert(
    '编辑器保存内容写入独立的 post_save 审计',
    saveRows.length > 0,
    saveRows[0]?.text ?? '（没有 post_save 记录）'
  )

  /*
   * 项目四个动作码必须都能翻成人话。`project_reorder` 是这次新加的 ——
   * 未登记的动作会回退成原始码，日志页不会崩，但会显示一串英文码，
   * 所以「能翻成人话」才是有意义的断言。
   */
  const projectActions = ['project_create', 'project_update', 'project_reorder', 'project_delete']
  const projectRows = (audits.json?.items ?? []).filter((l) => projectActions.includes(l.action))
  const seenProjectActions = new Set(projectRows.map((l) => l.action))
  assert(
    '项目增改排序删四个动作都写了审计',
    projectActions.every((a) => seenProjectActions.has(a)),
    `已记录：${[...seenProjectActions].join(', ') || '(空)'}`
  )
  assert(
    '项目动作在日志页都翻译成了中文（没有未登记的动作码）',
    projectRows.length > 0 && projectRows.every((l) => /^[\u4e00-\u9fa5]/.test(l.text ?? '')),
    projectRows.map((l) => l.text).slice(0, 3).join(' · ') || '(空)'
  )

  // 16b. 站点设置：读规格 → 校验拒绝 → 写入 → 回滚
  const settings = await call('GET', '/api/admin/settings')
  const groups = settings.json?.groups ?? []
  assert(
    '站点设置返回 5 个分区',
    settings.status === 200 && groups.length === 5,
    groups.map((g) => `${g.label}(${g.fields.length})`).join(' ')
  )

  const integrations = groups.find((g) => g.key === 'integrations')
  assert(
    '「集成与密钥」为只读运行信息，不含可写字段',
    integrations?.readOnly === true && integrations.fields.every((f) => f.type === 'readonly'),
    integrations?.fields?.map((f) => f.label).join(' / ')
  )
  assert(
    '应用密钥接口只返回状态，不返回值本身',
    typeof integrations?.fields?.find((f) => f.key === '_appSecret')?.value === 'string' &&
      /已配置/.test(integrations.fields.find((f) => f.key === '_appSecret').value),
    integrations?.fields?.find((f) => f.key === '_appSecret')?.value
  )

  const badKey = await call('PATCH', '/api/admin/settings', { totally_unknown_field: 'x' })
  assert('未声明的设置项被拒绝（400，而不是静默丢弃）', badKey.status === 400, badKey.json?.error ?? '')

  const badSelect = await call('PATCH', '/api/admin/settings', { language: 'fr' })
  assert('下拉项取值越界返回 400', badSelect.status === 400, badSelect.json?.error ?? '')

  const badUrl = await call('PATCH', '/api/admin/settings', { logo: 'javascript:alert(1)' })
  assert('危险协议的头像/Logo 地址返回 400', badUrl.status === 400, badUrl.json?.error ?? '')

  const badNumber = await call('PATCH', '/api/admin/settings', { weeklyTarget: '0' })
  assert('数值越界返回 400', badNumber.status === 400, badNumber.json?.error ?? '')

  const currentTarget = groups.find((g) => g.key === 'basic')?.fields?.find((f) => f.key === 'weeklyTarget')?.value ?? '10'
  const nextTarget = String(Number.parseInt(currentTarget, 10) + 1)
  const saved = await call('PATCH', '/api/admin/settings', { weeklyTarget: nextTarget })
  const savedBack = await call('PATCH', '/api/admin/settings', { weeklyTarget: currentTarget })
  assert(
    '保存设置并回滚（只回传发生变化的字段）',
    saved.status === 200 && saved.json?.changed?.length === 1 && saved.json.changed[0].to === nextTarget && savedBack.json?.changed?.length === 1,
    `每周目标 ${currentTarget} → ${nextTarget} → ${currentTarget}`
  )

  const unchanged = await call('PATCH', '/api/admin/settings', { weeklyTarget: currentTarget })
  assert(
    '重复保存同一个值不产生变更与审计噪音',
    unchanged.status === 200 && unchanged.json?.changed?.length === 0
  )

  const afterSettings = await call('GET', '/api/admin/audit-logs?range=0&perPage=50')
  const hasSettingsAudit = (afterSettings.json?.items ?? []).some((l) => l.action === 'settings_update')
  const settingsAuditRow = (afterSettings.json?.items ?? []).find((l) => l.action === 'settings_update')
  assert('设置变更已落审计且不记录具体取值', hasSettingsAudit, settingsAuditRow?.text ?? '')
  assert(
    '设置审计文本里不含被改动的值',
    Boolean(settingsAuditRow) && !settingsAuditRow.text.includes(nextTarget),
    settingsAuditRow?.text ?? ''
  )

  // 16c. 维护模式：真的会拦前台，且不会把自己锁在门外
  const beforeMaint = await call('GET', '/')
  const staticUp = beforeMaint.status === 200
  if (!staticUp) {
    ok('未提供静态产物（SERVE_STATIC=0 或未构建），跳过维护模式验证')
  } else {
    const on = await call('PATCH', '/api/admin/settings', { maintenance: true })
    const front = await call('GET', '/')
    const frontBlog = await call('GET', '/blog')
    const adminPage = await call('GET', '/admin')
    const healthz = await call('GET', '/healthz')
    const apiHealth = await call('GET', '/api/health')

    assert('开启维护模式成功', on.status === 200 && on.json?.changed?.length === 1)
    assert(
      '维护模式下前台页面返回 503 + 维护提示页',
      front.status === 503 && /站点维护中/.test(String(front.text)),
      `HTTP ${front.status}`
    )
    assert('维护模式同样覆盖深链接（/blog）', frontBlog.status === 503)
    assert(
      '维护模式不影响后台入口（否则等于把自己锁在门外）',
      adminPage.status === 200 && /id="root"/.test(String(adminPage.text)),
      `/admin → ${adminPage.status}`
    )
    assert('维护模式不影响 /healthz 与接口', healthz.status === 200 && apiHealth.status === 200)

    const off = await call('PATCH', '/api/admin/settings', { maintenance: false })
    const after = await call('GET', '/')
    assert(
      '关闭维护模式后前台恢复（无需重启）',
      off.status === 200 && after.status === 200 && !/站点维护中/.test(String(after.text))
    )
  }

  // 16d. 日志保留期的清理入口
  const prune = await call('POST', '/api/admin/audit-logs/prune')
  assert(
    '日志清理端点返回清理条数与剩余总数',
    prune.status === 200 && typeof prune.json?.removed === 'number' && typeof prune.json?.total === 'number',
    `清理 ${prune.json?.removed} 条，剩余 ${prune.json?.total} 条`
  )

  /*
   * 16e. 访客记录：明文明细 → 聚合 → 地区/设备 → 筛选 → 分页。
   *
   * 这一屏与仪表盘的「独立访客」读的**不是**同一份数据：仪表盘读 page_views 里的
   * 加盐哈希，这里读落明文的 visitor_logs。所以断言的重点不是「有没有数据」，
   * 而是三条容易悄悄坏掉的边界：
   *   1. 明文 IP 只在登录态下可见 —— 这是整份明细唯一的保护；
   *   2. 后台自己的访问不进明细 —— 否则天天泡在后台的管理员会变成最活跃的访客；
   *   3. 公网来源能解析出地区、内网来源短路成「内网地址」而不是「未知」。
   *
   * 公网 IP 用 `X-Forwarded-For` 模拟：本机直连只能造出 127.0.0.1，而
   * `trust proxy=1` 下 XFF 正是线上 nginx 透传真实来源的那条路径，用它才验得到解析链路。
   */
  const savedCookie = cookie
  cookie = ''
  const visitorsAnon = await call('GET', '/api/admin/visitors')
  cookie = savedCookie
  assert(
    '未登录访问 /api/admin/visitors 返回 401（明文 IP 不外泄）',
    visitorsAnon.status === 401,
    `HTTP ${visitorsAnon.status}`
  )

  /*
   * 明文明细只能出现在登录态的后台接口里。公开内容接口是**匿名可读**的，
   * 一旦哪天有人图省事把访客聚合挂到它下面，泄漏是静默的 —— 页面照常渲染，
   * 没人会发现。所以这里不看某个具体字段，而是把整份响应递归扫一遍键名。
   */
  const publicDoc = await call('GET', '/api/content')
  const leakedKeys = new Set()
  const walkKeys = (v) => {
    if (Array.isArray(v)) return v.forEach(walkKeys)
    if (v && typeof v === 'object') {
      for (const [k, val] of Object.entries(v)) {
        if (/^(ip|ua|useragent|visitor|visitors|visitorlogs|lastua|firstat|lastat)$/i.test(k)) leakedKeys.add(k)
        walkKeys(val)
      }
    }
  }
  walkKeys(publicDoc.json)
  assert(
    '公开内容接口不含任何访客明文字段（IP / UA / 时间戳）',
    publicDoc.status === 200 && leakedKeys.size === 0,
    leakedKeys.size ? `发现字段：${[...leakedKeys].join(', ')}` : '递归扫描键名，无命中'
  )

  const visitorDefaults = await call('GET', '/api/admin/visitors')
  assert(
    '访客接口默认近 7 天、每页 20 条，并返回完整信封',
    visitorDefaults.status === 200 &&
      visitorDefaults.json?.range === 7 &&
      visitorDefaults.json?.perPage === 20 &&
      Array.isArray(visitorDefaults.json?.items) &&
      typeof visitorDefaults.json?.total === 'number' &&
      typeof visitorDefaults.json?.views === 'number' &&
      typeof visitorDefaults.json?.totalPages === 'number' &&
      typeof visitorDefaults.json?.retentionDays === 'number',
    `range=${visitorDefaults.json?.range} · perPage=${visitorDefaults.json?.perPage} · total=${visitorDefaults.json?.total} · views=${visitorDefaults.json?.views}`
  )
  assert(
    '明细保留期是正整数（界面上按它写「明细保留 N 天」）',
    Number.isInteger(visitorDefaults.json?.retentionDays) && visitorDefaults.json?.retentionDays > 0,
    `retentionDays=${visitorDefaults.json?.retentionDays}`
  )

  const UA_CHROME =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  const UA_IPHONE =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1'
  const UA_BOT = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'
  /*
   * 用于验地区解析的公网 IP。
   *
   * 默认取 RFC 5737 的文档保留段（TEST-NET-3）：保留段解析不出真实省市，
   * 因此下面的断言只验「被识别为非私网、且给出了地区对象」。
   * 要验具体地名时用 `SMOKE_PUBLIC_IP` 覆盖成一个你知道归属的地址。
   *
   * 早先这里写死了一个真实的国内 IP，断言也顺带绑定了它的省市 ——
   * 等于把一个能定位到具体区域的地址永久写进仓库，而它只是测试数据。
   */
  const PUBLIC_IP = process.env.SMOKE_PUBLIC_IP ?? '203.0.113.77'

  /** 走页面外壳请求（访客明细只在这条路径上写入），可指定 UA 与模拟来源 IP */
  const shellVisit = async (path, ua, xff) => {
    const res = await fetch(`${BASE}${path}`, {
      headers: { 'User-Agent': ua, ...(xff ? { 'X-Forwarded-For': xff } : {}) },
      redirect: 'manual',
    })
    // 必须读完正文：只取 status 会把连接留在半开状态，后续请求可能被挂住
    await res.text()
    return res.status
  }

  if ((await call('GET', '/')).status !== 200) {
    ok('未提供静态产物，跳过访客明细写入验证（聚合与地区解析另由数据层脚本覆盖）')
  } else {
    // 同 IP 三次访问、其中最后一次换设备：用来验聚合与「设备取最后一次」
    await shellVisit('/', UA_CHROME, PUBLIC_IP)
    await shellVisit('/blog', UA_CHROME, PUBLIC_IP)
    await shellVisit('/projects', UA_IPHONE, PUBLIC_IP)
    // 不带 XFF：真实来源就是本机，用来看内网短路
    await shellVisit('/', UA_CHROME)
    // 爬虫来源单独给一个 IP，避免与上面的公网访客混成一行
    await shellVisit('/', UA_BOT, '66.249.66.1')

    const logged = await call('GET', '/api/admin/visitors?range=0&perPage=100')
    const rows = logged.json?.items ?? []
    const pub = rows.find((r) => r.ip === PUBLIC_IP)

    assert(
      '同一 IP 聚合成一行，浏览数累加而不是每访问一次多一行',
      Boolean(pub) && pub.views >= 3 && rows.filter((r) => r.ip === PUBLIC_IP).length === 1,
      pub ? `${pub.ip} · ${pub.views} 次浏览 · 跨 ${pub.days} 天` : '未找到该 IP'
    )
    assert(
      '首次/最近访问都带上了可直接上屏的时间标签',
      Boolean(pub) && Boolean(pub.firstLabel) && Boolean(pub.lastLabel),
      pub ? `${pub.firstLabel} → ${pub.lastLabel}` : '无'
    )
    assert(
      '设备取「最后一次」访问的 UA（换设备后显示新设备，不把历史串成一列）',
      Boolean(pub) && pub.device?.kind === 'mobile' && /iPhone|Safari|iOS/.test(pub.device?.label ?? ''),
      pub?.device ? `${pub.device.kind} · ${pub.device.label}` : '无设备信息'
    )

    const local = rows.find((r) => r.ip === '127.0.0.1')
    assert(
      '内网来源短路成「内网地址」，不查库也不显示成「未知」',
      Boolean(local) && local.region?.private === true && local.region.label === '内网地址',
      local?.region ? local.region.label : '未找到 127.0.0.1'
    )

    const bot = rows.find((r) => r.ip === '66.249.66.1')
    assert(
      '爬虫 UA 被单独识别，不会被当成普通访客',
      Boolean(bot) && bot.device?.kind === 'bot',
      bot?.device ? `${bot.device.kind} · ${bot.device.label}` : '未找到爬虫 IP'
    )

    /*
     * 地区解析依赖离线库（data/ip2region_v4.xdb，不进 git）。
     * 库不在时就跳过这一段，而不是判失败 —— 缺一列地区是**已设计好的降级**，
     * 不是缺陷；所以这里只断「接口有没有如实回报 geoReady」，不要求库必然存在。
     */
    if (logged.json?.geoReady) {
      /*
       * 两条分开断：
       *   1. 任何时候都要成立 —— 地区解析链路通了、没把它误判成内网；
       *   2. 只在显式指定了 SMOKE_PUBLIC_IP 时才验地名 —— 默认的保留段解析不出
       *      真实省市，拿它要求「必须解析出省市」只会得到一条永远失败的测试。
       */
      assert(
        '公网 IP 被识别为非私网，且给出了地区对象',
        Boolean(pub?.region) && pub.region.private === false,
        pub?.region ? `${pub.region.label} · ${pub.region.isp}` : `region=${JSON.stringify(pub?.region)}`
      )

      if (process.env.SMOKE_PUBLIC_IP) {
        assert(
          '指定的公网 IP 解析出具体省市与运营商（不是「内网地址」也不是「未知」）',
          !/未知|内网|保留|未识别/.test(pub?.region?.label ?? '') && Boolean(pub?.region?.isp),
          pub?.region ? `${pub.region.label} · ${pub.region.isp}` : `region=${JSON.stringify(pub?.region)}`
        )
      }
    } else {
      ok('离线地区库缺失，跳过地区解析断言（geoReady=false，地区一列暂时为空）')
    }

    // 后台自身的访问必须被排除：连打三个后台页面，总浏览数不该动
    const beforeAdminViews = (await call('GET', '/api/admin/visitors?range=0&perPage=100')).json?.views
    await call('GET', '/admin')
    await call('GET', '/admin/audit')
    await call('GET', '/admin/visitors')
    const afterAdmin = await call('GET', '/api/admin/visitors?range=0&perPage=100')
    assert(
      '后台自身的访问不进访客明细（否则管理员就是最活跃的访客）',
      typeof beforeAdminViews === 'number' && afterAdmin.json?.views === beforeAdminViews,
      `${beforeAdminViews} → ${afterAdmin.json?.views}`
    )
  }

  // 筛选与分页边界：不依赖是否有数据，任何环境下都该成立
  const byKeyword = await call('GET', `/api/admin/visitors?range=0&keyword=${PUBLIC_IP}`)
  assert(
    '关键词按 IP 过滤，且只返回命中的行',
    byKeyword.status === 200 && (byKeyword.json?.items ?? []).every((r) => r.ip.includes(PUBLIC_IP)),
    `命中 ${byKeyword.json?.total} 位`
  )
  /*
   * 这里**不能**拿 `PUBLIC_IP` 当「不存在的地址」：上面刚用它造过访客，查它必然命中
   * （此前这条一直写死 `203.0.113.77`，正好与默认值撞上，所以长期是失败的）。
   * 换一个同属 RFC 5737 文档保留段、但脚本从不使用的地址。
   */
  const noMatch = await call('GET', '/api/admin/visitors?range=0&keyword=198.51.100.254')
  assert(
    '无匹配时返回空列表而不是报错',
    noMatch.status === 200 && noMatch.json?.total === 0 && (noMatch.json?.items ?? []).length === 0
  )
  const badRange = await call('GET', '/api/admin/visitors?range=999')
  assert(
    '非法时间范围回落到默认 7 天，而不是被当成「全部」',
    badRange.status === 200 && badRange.json?.range === 7,
    `range=${badRange.json?.range}`
  )
  const wide = await call('GET', '/api/admin/visitors?range=0&perPage=1000')
  assert(
    'perPage 上限收敛到 100（防止一次把整份明细拉走）',
    wide.status === 200 && wide.json?.perPage === 100,
    `perPage=${wide.json?.perPage}`
  )
  const overflow = await call('GET', '/api/admin/visitors?range=0&page=999')
  assert(
    '越界页码收敛到最后一页，而不是返回空列表或报错',
    overflow.status === 200 && overflow.json?.page === overflow.json?.totalPages,
    `page=${overflow.json?.page} / totalPages=${overflow.json?.totalPages}`
  )

  // 17. 登出后会话必须失效
  const out = await call('POST', '/api/admin/logout')
  const after = await call('GET', '/api/admin/me')
  assert('登出后 /api/admin/me 返回 401', out.status === 200 && after.status === 401)

  // 18. 再登录一次（此时已绑定 2FA，必然走两段式）
  let relogin = await call('POST', '/api/admin/login', { email, password })
  const secretForRetry = enrolledSecret ?? process.env.TOTP_SECRET
  if (relogin.json?.stage === '2fa') {
    if (secretForRetry) {
      const code = await totpCode(secretForRetry)
      const ticket = relogin.json.ticket
      const verified = await call('POST', '/api/admin/2fa/verify', { ticket, code })
      assert('重新登录走两段式并验证通过', verified.status === 200, `stage=${verified.json?.stage}`)
    } else {
      ok('重新登录返回 stage=2fa（未提供密钥，跳过验证码校验）')
    }
  } else {
    fail('重新登录应返回 stage=2fa', `实际 stage=${relogin.json?.stage}`)
  }

  /*
   * 19. 回归守卫：紧接着再来一次两段式登录。
   *
   * 这一步的登录票据 id 必然 **不等于** 用户 id —— 而「票据 id == 用户 id」正是当初
   * 掩盖缺陷的巧合：`readLoginTicket()` 取的是 `t.id`，被当成用户 id 写进了
   * `sessions.user_id`，第一条路径侥幸命中，第二张票据就撞外键约束（500，登录全挂）。
   * 只做一次登录的断言拦不住它，必须连做两次。
   */
  if (relogin.json?.stage === '2fa' && secretForRetry) {
    const again = await call('POST', '/api/admin/login', { email, password })
    const verified2 = await call('POST', '/api/admin/2fa/verify', {
      ticket: again.json?.ticket,
      code: await totpCode(secretForRetry),
    })
    assert(
      '第二张登录票据同样能签发会话（票据 id ≠ 用户 id）',
      verified2.status === 200,
      `HTTP ${verified2.status}${verified2.json?.error ? ` · ${verified2.json.error}` : ''}`
    )

    const me2 = await call('GET', '/api/admin/me')
    assert(
      '会话归属到正确的用户，而不是票据 id',
      me2.status === 200 && me2.json?.user?.id === me.json?.user?.id && me2.json?.user?.email === email,
      `user.id=${me2.json?.user?.id}（首次登录时为 ${me.json?.user?.id}）`
    )
  }

  const failed = results.filter((r) => !r.pass)
  console.log(`\n共 ${results.length} 项，通过 ${results.length - failed.length}，失败 ${failed.length}`)
  if (enrolledSecret) {
    console.log(`\n本次新绑定的 2FA 密钥（重跑时用 TOTP_SECRET 传入）：\n  ${enrolledSecret}\n`)
  }
  if (failed.length) {
    console.log('失败项：')
    failed.forEach((f) => console.log(`  - ${f.name}${f.detail ? ` (${f.detail})` : ''}`))
    process.exit(1)
  }
  console.log('全部通过 ✓\n')
}

main().catch((err) => {
  console.error('冒烟测试异常终止:', err)
  process.exit(1)
})
