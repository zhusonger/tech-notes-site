import { renderToString } from 'react-dom/server'
import { StaticRouter } from 'react-router-dom/server'
import { AppRoutes } from '../src/routes'
import AdminAudit from '../src/admin/pages/AdminAudit'
import AdminPostEditor from '../src/admin/pages/AdminPostEditor'
import AdminProjects from '../src/admin/pages/AdminProjects'
import AdminHome from '../src/admin/pages/AdminHome'
import AdminResume from '../src/admin/pages/AdminResume'
import AdminMedia from '../src/admin/pages/AdminMedia'
import AdminTaxonomy from '../src/admin/pages/AdminTaxonomy'
import AdminVisitors from '../src/admin/pages/AdminVisitors'
import AdminSettings from '../src/admin/pages/AdminSettings'
import { ArticleCard } from '../src/components/ArticleCard'
import { MarkdownBody } from '../src/lib/markdown'
import { ProjectCard } from '../src/components/ProjectCard'
/* 期望出现的**内容**文案从建库种子派生，而不是在这里抄一遍 —— 见 cases 前的注释 */
import { content } from '../shared/content.mjs'

interface RouteCase {
  path: string
  /** 应当出现的文案。只做排除断言的用例可以不给（如「不该显示别人的正文」）。 */
  expect?: string[]
  /** 不应出现在渲染结果里的内容，用于锁住「不要有 X」这类要求 */
  reject?: string[]
}

/*
 * 前台断言的**前提**：这里没有 SiteContentProvider，也没有网络，页面拿到的是
 * `shared/content.mjs` 生成的兜底内容（`src/data/site.ts` 的 DEFAULT_CONTENT）。
 *
 * 因此这批断言实际锁两件事：
 *   1. 兜底路径能渲染出完整内容 —— 接口挂掉时前台不能白屏；
 *   2. 兜底内容与建库种子是同一份源，所以「渲染出什么」与「线上显示什么」一致。
 * 接口侧的一致性由 scripts/api-smoke.mjs 断言。
 */
const cases: RouteCase[] = [
  {
    path: '/',
    /*
     * 期望出现的**内容**从种子派生，而不是在这里抄一遍字面量。
     *
     * 抄一遍的代价是「改种子必须记得同步改断言」，而漏改不会报错 —— 断言一直绿，
     * 直到有人真的去看页面。派生则让断言随种子走，换成本地内容也不会失效。
     *
     * 界面文案（「关于我」「技术栈」这些区块标题）仍然写死：它们定义在组件里，
     * 不随内容变，写死才挡得住「标题被误删」。
     */
    expect: [
      content.settings.author,
      content.sections.about.experience[0].company,
      content.sections.about.stats[0].value,
      content.sections.about.skills[0],
      content.projects[0].title,
      content.posts[0].title,
      '关于我',
      '技术栈',
      '精选项目',
      '最新博客',
    ],
  },
  {
    path: '/blog',
    expect: ['技术笔记', '全部文章', '把重复操作封装成可复用的技能', '单机跑十个服务的资源分配实践'],
    /*
     * 两条排除断言：
     * - 「订阅更新」的订阅表单已移除（页脚另有入口），列表页内不重复；
     * - 兜底内容 6 篇、每页 6 篇，只有一页 —— 分页条必须**如实隐藏**。
     *   此前它是一排点不动的假按钮（点「2」不动、点「下一页」不动），
     *   现在分页是真的，且不满一页时不渲染。加了第 7 篇后这条会失败，
     *   那时候正需要人回来看一眼分页是否还成立。
     */
    reject: ['订阅更新', '上一页', '下一页'],
  },
  {
    path: '/blog/reusable-skill',
    expect: [
      '工具链',
      '重复劳动的三个信号',
      '拆成三段来做',
      '回看这次封装',
      '附：完整脚本与参数说明',
      '目录',
      '相关文章',
      '上一篇',
      '标签',
    ],
    // 这是最新的一篇，没有「更新的」可指向 —— 宁可少一格，也不拿别的文章凑数
    reject: ['下一篇'],
  },
  {
    path: '/blog/self-hosted-ci-traps',
    expect: ['上一篇', '下一篇', '这篇的正文尚未撰写'],
  },
  {
    /*
     * 回归锁：曾经任何 slug 都会渲染出同一篇文章（越界 slug 直接兜到默认内容）。
     * 现在取不到就如实说取不到，绝不显示别人的正文。
     */
    path: '/blog/does-not-exist',
    reject: ['重复劳动的三个信号', '回看这次封装', '拆成三段来做'],
  },
  { path: '/projects', expect: ['开源项目', '全部作品', '1.2k', 'Python', '技能库与自动化工作流集'] },
  {
    path: '/resume',
    expect: [
      // 内容侧同样从种子派生（见首页用例的注释）
      content.sections.resumeExperience.jobs[0].title,
      content.settings.educationSchool,
      content.settings.educationCert,
      // 界面文案
      '简历',
      '个人概述',
      '核心竞争力',
      '核心技能',
      '工作经历',
      // 履历正文防复制：ResumeSection 上的 user-select: none
      'select-none',
    ],
    // 简历页不提供下载与打印入口
    reject: ['下载 PDF', '打印简历'],
  },
  /*
   * 后台。注意 SSR 下 `useEffect` 不执行，所以 AdminAuthProvider 的 loading 停在初始的
   * true —— 守卫渲染「正在校验会话…」。这恰好是一条有效的断言：未登录时后台内容
   * 一个字都不该出现在首屏 HTML 里。
   *
   * 代价是：**走路由断言不到任何后台页面正文**，只能验「守卫生效 + 渲染不抛错」。
   * 要验页面本身，见下面的 `pages`。
   */
  {
    path: '/admin',
    expect: ['正在校验会话'],
    reject: ['阅读趋势', '最近编辑', '待办与提醒', '操作日志'],
  },
  { path: '/admin/audit', expect: ['正在校验会话'], reject: ['待开发'] },
  { path: '/admin/settings', expect: ['正在校验会话'], reject: ['待开发'] },
  {
    /*
     * 文章编辑器的两条入口。
     * 断言的是「守卫先于编辑器生效」：未登录时正文编辑框、SEO 描述这些一个都不该
     * 出现在首屏 HTML 里。（编辑器本身能不能渲染，见下面的 pages。）
     */
    path: '/admin/posts/new',
    expect: ['正在校验会话'],
    reject: ['Markdown 已启用', '永久链接', 'SEO 描述', '发布设置'],
  },
  { path: '/admin/posts/1', expect: ['正在校验会话'], reject: ['Markdown 已启用', '永久链接', 'SEO 描述'] },
  {
    /*
     * 项目卡片墙。断言的是「守卫先于卡片墙生效」：未登录时项目名、语言筛选条、
     * 编辑弹层的字段一个都不该出现在首屏 HTML 里。
     */
    path: '/admin/projects',
    expect: ['正在校验会话'],
    reject: ['按排序权重', '仓库地址', '加入精选', '待开发'],
  },
  {
    /*
     * 首页内容。守卫先于表单生效：未登录时模块页签内的字段标签、行动按钮的四个
     * 输入位一个都不该出现在首屏 HTML 里 —— 那些是最能说明站上有什么的东西。
     */
    path: '/admin/home',
    expect: ['正在校验会话'],
    reject: ['主标题 H1', '行动按钮', '首屏配图地址', '实时预览'],
  },
  {
    /*
     * 简历。守卫先于表单生效：未登录时页签内的字段标签、站点级事实的取值
     * 一个都不该出现在首屏 HTML 里。
     */
    path: '/admin/resume',
    expect: ['正在校验会话'],
    reject: ['个人概述 Summary', '核心竞争力', '模块结构', '去站点设置修改'],
  },
  {
    path: '/admin/login',
    expect: ['内容管理后台', '邮箱地址', '在此设备保持登录 30 天', '本后台仅限授权管理员访问'],
  },
  {
    /*
     * 媒体库。守卫先于列表生效：未登录时不该出现上传提示、详情字段或任何文件名。
     */
    path: '/admin/media',
    expect: ['正在校验会话'],
    reject: ['拖拽或点击上传', '文件详情', '存储占用', '替代文本 Alt'],
  },
  {
    /*
     * 分类与标签。守卫先于列表生效：未登录时不该出现分类名、标签名或任何计数胶囊。
     */
    path: '/admin/taxonomy',
    expect: ['正在校验会话'],
    reject: ['输入标签后回车创建', '合并重复标签', '新建分类', '共 0 个分类'],
  },
  {
    /*
     * 访客记录。守卫先于列表生效：未登录时不该出现表头、筛选条件或任何 IP。
     * 哨兵 IP 取 RFC 5737 的文档保留段：它是不会真实出现的地址，
     * 一旦渲染出来必定是测试数据泄漏，而不是某个真实访客被曝光。
     */
    path: '/admin/visitors',
    expect: ['正在校验会话'],
    reject: ['IP 地址', '归属地区', '近 7 天', '按 IP 搜索', '203.0.113.77'],
  },
]

/**
 * 直接渲染页面组件，绕开路由与守卫。
 *
 * 这些组件在 SSR 下不执行 `useEffect`，因此不会发出任何请求 —— 断言的是
 * 「组件能渲染、页头文案在位」，不涉及数据。
 */
const pages: { name: string; render: () => string; expect: string[]; reject?: string[] }[] = [
  {
    name: 'AdminAudit',
    render: () =>
      renderToString(
        <StaticRouter location="/admin/audit">
          <AdminAudit />
        </StaticRouter>,
      ),
    expect: ['操作日志', '记录后台的关键操作与登录事件'],
    reject: ['待开发'],
  },
  {
    name: 'AdminSettings',
    render: () =>
      renderToString(
        <StaticRouter location="/admin/settings">
          <AdminSettings />
        </StaticRouter>,
      ),
    expect: ['站点设置', '站点基础信息、SEO 元数据、域名与作者资料'],
    reject: ['待开发'],
  },
  {
    /*
     * 分类与标签直渲（服务端不执行 `useEffect`，所以同样停在加载态）。
     *
     * 断言：
     *   1. 页头、「预览前台」与左右两块面板的骨架在位 —— 分类表头（名称 / 文章数）
     *      与卡脚「新建分类」是这一屏区别于占位页的部分；
     *   2. 分类与标签的**名字**全部来自服务端，加载态下一个都不该出现 —— 写死
     *      `Android` / `adb` 就是抄了一份种子到前端，改了库前台就会显示旧名字；
     *   3. 计数走 `{n}` 占位，加载态是 0 而不是画布上的 9 —— 画布上的「共 9 个分类」
     *      是设计稿示意值，不是本站的真实分类数；
     *   4. 标签面板底部的说明卡照写「删除标签不会删除文章」，这句是这一屏的承诺，
     *      接口侧由 api-smoke 的删除用例锁住。
     */
    name: 'AdminTaxonomy(/admin/taxonomy)',
    render: () =>
      renderToString(
        <StaticRouter location="/admin/taxonomy">
          <AdminTaxonomy />
        </StaticRouter>,
      ),
    expect: [
      '分类与标签',
      '管理文章分类与标签，用于前台筛选、归档与 SEO 关键词',
      '预览前台',
      '分类',
      '拖动排序决定前台归档页的展示顺序',
      '共 0 个分类',
      '名称',
      '文章数',
      '分类用于前台「博客」页的归档筛选',
      '新建分类',
      '标签',
      '共 0 个标签 · 按使用频次排序',
      '输入标签后回车创建',
      '合并重复标签',
      '标签同时用于前台筛选与 SEO 关键词。删除标签不会删除文章，仅解除关联。',
    ],
    reject: ['Android', '自托管', 'adb', 'PDF', '还没有分类', '共 9 个分类', '示例作者', '读取失败', '待开发'],
  },
  {
    /*
     * 访客记录直渲。
     *
     * 断言：
     *   1. 页头与表头六列（IP / 地区 / 设备 / 浏览 / 首次 / 最近）在位 —— 这组列是这一屏
     *      区别于操作日志的地方；
     *   2. 保留期政策照写「明细保留 30 天」，这是对访客的承诺，接口侧由 retentionDays 锁住；
     *   3. 加载态下不出现任何具体 IP、地区或设备名 —— 数据全部来自服务端，写死任何一个
     *      都是把服务端解析结果抄了一份到前端；
     *   4. 不出现「待开发」，防止路由回退到占位页。
     */
    name: 'AdminVisitors(/admin/visitors)',
    render: () =>
      renderToString(
        <StaticRouter location="/admin/visitors">
          <AdminVisitors />
        </StaticRouter>,
      ),
    expect: [
      '访客记录',
      '展示站的来源明细：每个独立访客的 IP、归属地区与访问设备',
      'IP 地址',
      '归属地区',
      '访问设备',
      '浏览',
      '首次访问',
      '最近访问',
      '今天',
      '近 7 天',
      '近 30 天',
      '全部',
      '按 IP 搜索',
      '明细保留 30 天',
      '共 0 位独立访客 · 0 次浏览',
    ],
    /*
     * 无数据时不该渲染出任何访客行内容：IP、地区、设备。
     * 哨兵用 RFC 5737 的文档保留段与 UA 片段，而不是真实 IP 与地区串 ——
     * 后者的作用是「万一 mock 数据泄漏」，不该为此把一个真实地址写进仓库。
     *
     * 末两条锁住「不要有 X」：地区库缺失只是暂时的（几秒后自己就位），
     * 为它在页面上挂一条提示读起来像故障公告，已明确去掉 —— 写死文案在这里
     * 是为了让它**回不来**（文案常量本身已从 `src/data/admin.ts` 删除）。
     */
    reject: [
      '203.0.113.77',
      '198.51.100.1',
      'Chrome',
      '待开发',
      '地区库正在后台获取',
      '地区库获取失败',
    ],
  },
  {
    /*
     * 正文注入锁。
     *
     * 正文来自数据库（作者可写任意内容），渲染路径**不能**是拼 HTML 字符串 ——
     * 一旦有人把它改成 dangerouslySetInnerHTML，这条断言会立刻失败。
     * 断言的是「尖括号被转义成实体」，而不是「某个过滤函数被调用过」。
     */
    name: 'MarkdownBody(注入转义)',
    render: () =>
      renderToString(
        <MarkdownBody
          source={'<script>alert(1)</script> 与 <img src=x onerror=alert(2)> 都应当只是文字\n\n## 小标题\n\n**加粗** 与 `行内代码`'}
        />,
      ),
    expect: ['&lt;script&gt;', '&lt;img src=x onerror=alert(2)&gt;', '小标题', '加粗', '行内代码'],
    reject: ['<script>', '<img src=x'],
  },
  {
    /*
     * 文章编辑器直渲（新建态）。
     *
     * `useParams` 在没有匹配路由时返回空对象，于是组件落在「新建」分支上 ——
     * 正好是我们要验的那一支：字段齐、按钮齐、且没有请求。
     *
     * `reject: ['自动保存']` 是一条**产品口径断言**：画布上的状态行写的是
     * 「自动保存于 2 分钟前」，但本后台的保存是显式的（自动保存会把操作日志刷屏）。
     * 哪天有人照画布把这句补上，这条会失败，逼着人先想清楚保存到底自不自动。
     */
    name: 'AdminPostEditor(/admin/posts/new)',
    render: () =>
      renderToString(
        <StaticRouter location="/admin/posts/new">
          <AdminPostEditor />
        </StaticRouter>,
      ),
    expect: [
      '新建文章',
      '标题',
      '永久链接',
      '摘要 · 列表页与 SEO 描述共用',
      'Markdown 已启用',
      '发布设置',
      '封面图',
      'SEO 描述',
      '添加标签',
      '尚未保存',
    ],
    reject: ['自动保存'],
  },
  {
    /*
     * 项目卡片墙直渲（未带 `?new=1`）。
     *
     * 断言三件事：
     *   1. 页头与副标题在位，且副标题的计数是**真实数字**拼的（这里没有数据，就是 0）
     *      ——「20 个项目 · 6 个精选 · 6.8k stars」是画布上的示意值，不能照抄；
     *   2. 排序默认落在「按排序权重」上，且此时拖拽是**可用**的（副标题说的是拖拽）；
     *   3. 编辑弹层没有自己打开 —— 它只由 `?new=1` 或点卡片触发。
     */
    name: 'AdminProjects(/admin/projects)',
    render: () =>
      renderToString(
        <StaticRouter location="/admin/projects">
          <AdminProjects />
        </StaticRouter>,
      ),
    expect: ['项目', '0 个项目', '0 个精选', '拖拽卡片调整前台顺序', '全部', '按排序权重'],
    reject: ['仓库地址', '永久链接', '加入精选', '待开发'],
  },
  {
    /*
     * 首页内容直渲（服务端不执行 `useEffect`，所以这一支停在加载态）。
     *
     * 断言：
     *   1. 页头与「预览前台」在位；
     *   2. 右侧预览卡有自己的标题与「首页 · 首屏 Hero」这个作用域标注 ——
     *      画布上写的是「1440 × 900」，那是**排版规格**，不是真实视口，照抄会变成
     *      一句没有来源的假数据，所以只断言它确实标了尺寸而不是断言具体数字；
     *   3. 服务端渲染时字段一个都不渲染（还没有数据），因此不能出现「主标题 H1」——
     *      出了就说明有人在加载态里照抄了画布的示意值。
     */
    name: 'AdminHome(/admin/home)',
    render: () =>
      renderToString(
        <StaticRouter location="/admin/home">
          <AdminHome />
        </StaticRouter>,
      ),
    expect: ['首页内容', '编辑前台首页可见的文案与配图', '预览前台', '实时预览', '首页 · 首屏 Hero', '正在加载…'],
    reject: ['主标题 H1', '行动按钮', '首屏配图地址', '待开发'],
  },
  {
    /*
     * 简历屏直渲（服务端不执行 `useEffect`，所以这一支停在加载态）。
     *
     * 断言：
     *   1. 页头与「预览前台」在位；
     *   2. 右侧「模块结构」面板在位 —— 它是这一屏区别于首页内容屏的部分；
     *   3. 加载态下不出现任何字段标签与站点级事实的**取值**：那几项在库里属于
     *      `site_settings`，服务端没有数据时必须显空 —— 照抄设计稿上的示意姓名与
     *      城市就是假数据（示意值一律用中性的「示例作者 / 示例城市」，别写具体的人
     *      和地点：这份脚本会随公开副本一起发布）。
     */
    name: 'AdminResume(/admin/resume)',
    render: () =>
      renderToString(
        <StaticRouter location="/admin/resume">
          <AdminResume />
        </StaticRouter>,
      ),
    expect: ['简历', '编辑简历页的概要、经历与技能', '预览前台', '模块结构', '正在加载…'],
    reject: ['示例作者', '示例城市', '个人概述 Summary', '读取失败', '待开发'],
  },
  {
    /*
     * 媒体库直渲（服务端不执行 `useEffect`，所以同样停在加载态）。
     *
     * 断言：
     *   1. 页头与「预览前台」在位；右侧「文件详情」面板在位 —— 它是这一屏区别于
     *      首页内容屏的部分；上传瓦片只出现在数据到位之后，加载态是骨架；
     *   2. 类型分组与排序的**选项**来自服务端，加载态下不该出现任何一个具体分组名
     *      （写死「图片 / 图标 / 文档」就等于把服务端的口径抄了一份到前端）；
     *   3. 空态下不出现任何文件名、体积与替代文本示意值 —— 抄画布上的
     *      `article-adb-cover.png` / `1.24 MB` 就是假数据。
     */
    name: 'AdminMedia(/admin/media)',
    render: () =>
      renderToString(
        <StaticRouter location="/admin/media">
          <AdminMedia />
        </StaticRouter>,
      ),
    expect: ['媒体库', '统一管理站点使用的图片与图标', '预览前台', '全部文件', '文件详情', '统计中…', '存储占用', '还没有文件'],
    reject: ['article-adb-cover.png', '1.24 MB', '替代文本 Alt', '示例作者', '读取失败', '待开发'],
  },
  {
    /*
     * 链接协议白名单。
     *
     * `javascript:` 这类协议的链接必须**降级成纯文本**，而不是渲染成一个点一下就
     * 执行脚本的 `<a>`。断言落在 `href="javascript` 这个具体产物上，而不是
     * 「某个过滤函数被调用过」—— 后者在换实现时会变成假绿。
     */
    name: 'MarkdownBody(链接协议白名单)',
    render: () =>
      renderToString(
        <MarkdownBody source={'[正常](https://example.com) 与 [危险](javascript:alert(1)) 与 [站内](/blog)'} />,
      ),
    expect: ['href="https://example.com"', 'href="/blog"', '[危险](javascript:alert(1))'],
    reject: ['href="javascript'],
  },
  {
    /*
     * 文章卡片的两个「空值」边界。
     *
     * 直接渲组件而不是断言 `/blog` 页面：种子里的文章既有分类也有封面，
     * 页面级断言只会验到「都有」那一支 —— 恰好是这里最不需要保护的分支。
     *   1. 没有分类 → 不能留下一个**没有字的分类胶囊**。它比「没有分类」更像坏控件：
     *      一个带底色的空方块，看着像界面坏了，而实际只是这个字段没填。
     *      排除的是 `Chip` 的底色变量，而不是「某个条件分支被走过」——
     *      后者在换实现时会变成假绿。
     *   2. 没有封面 → 必须换成默认封面。留空不是「什么都不显示」：封面位是固定
     *      高度的，空 `src` 会被浏览器画成破图图标外加一段 alt 文字。
     */
    name: 'ArticleCard(无分类、无封面)',
    render: () =>
      renderToString(
        <StaticRouter location="/blog">
          <ArticleCard
            post={{
              id: 1,
              slug: 'no-cat-no-cover',
              title: '没有分类也没有封面的样例',
              category: '',
              excerpt: '用来验两个空值边界。',
              dateLabel: '2026.09.23',
              views: 12,
              viewsLabel: '12 阅读',
              readingLabel: '',
              image: '',
            }}
          />
        </StaticRouter>,
      ),
    expect: ['没有分类也没有封面的样例', 'src="/images/cover-default.svg"'],
    reject: ['color-tag-bg', 'src=""'],
  },
  {
    /*
     * 分类的位置：必须在标题与摘要**之后**。
     *
     * 分类是有无不定的字段。它摆在前面时，有分类的卡片标题被整体推下一行 ——
     * 同一行里几张卡的标题基线就不齐了，无分类的那张会往上冒。
     * （上面那条用例只有「空分类不画」这一半，这一条补上位置。）
     *
     * 断言用的是 `p-[22px]"><h3`：`expect` 是子串包含，表达不了「A 在 B 之前」，
     * 但「内容区容器的第一个子元素就是标题」与「分类不在标题之前」是同一件事的
     * 等价表述 —— 分类一旦被挪回前面，这个子串立刻消失。前半 `color-tag-bg`
     * 反过来证明分类确实画出来了（不是靠「没画」蒙混过关）。
     */
    name: 'ArticleCard(有分类：分类在标题与摘要之后)',
    render: () =>
      renderToString(
        <StaticRouter location="/blog">
          <ArticleCard
            post={{
              id: 2,
              slug: 'with-category',
              title: '带分类的样例',
              category: '工具链',
              excerpt: '用来验分类的位置。',
              dateLabel: '2026.09.23',
              views: 34,
              viewsLabel: '34 阅读',
              readingLabel: '',
              image: '/images/hero-workspace.png',
            }}
          />
        </StaticRouter>,
      ),
    expect: ['带分类的样例', '工具链', 'color-tag-bg', 'p-[22px]"><h3'],
    reject: ['src=""'],
  },
  {
    /*
     * 项目卡片的仓库跳转。
     *
     * 直接渲组件而不是断言 /projects 页面：种子数据里的项目**没有**仓库地址，
     * 页面级断言只会验到「没有链接」那一支 —— 恰好是这一屏最不需要保护的分支。
     * 这里把两种形态都锁住：
     *   1. 填了地址 → 整卡是 `<a>`，新标签页打开，且带 rel 防 window.opener 回流；
     *   2. 没填地址 → 退回 `<article>`，绝不能渲染出一个空 href（点一下跳到当前页）。
     */
    name: 'ProjectCard(仓库链接)',
    render: () =>
      renderToString(
        <ProjectCard
          variant="full"
          project={{
            id: 1,
            slug: 'tech-notes-site',
            title: 'Tech Notes',
            description: '个人技术主页与内容后台',
            tags: 'React · Express',
            language: 'TypeScript',
            stars: 12,
            starsLabel: '12',
            forks: 3,
            forksLabel: '3',
            repoUrl: 'https://github.com/example/repo',
            featured: true,
          }}
        />,
      ),
    expect: [
      '<a href="https://github.com/example/repo"',
      'target="_blank"',
      'rel="noreferrer noopener"',
    ],
    reject: ['<article'],
  },
  {
    name: 'ProjectCard(未填仓库地址)',
    render: () =>
      renderToString(
        <ProjectCard
          variant="full"
          project={{
            id: 2,
            slug: 'no-repo',
            title: '未填仓库的项目',
            description: '后台允许仓库地址留空',
            tags: 'Go',
            language: 'Go',
            stars: 0,
            starsLabel: '0',
            forks: 0,
            forksLabel: '0',
            repoUrl: null,
            featured: false,
          }}
        />,
      ),
    expect: ['<article'],
    reject: ['target="_blank"', 'href=""'],
  },
]

let failures = 0

/** 三个维度共用一份：渲染不抛错 → expect 全命中 → reject 全不命中。 */
function verify(label: string, render: () => string, expect: string[] = [], reject?: string[]) {
  let html = ''
  try {
    html = render()
  } catch (error) {
    failures += 1
    console.log(`FAIL  ${label} — 渲染抛错: ${(error as Error).message}`)
    return
  }

  const missing = expect.filter((token) => !html.includes(token))
  if (missing.length > 0) {
    failures += 1
    console.log(`FAIL  ${label} — 缺失内容: ${missing.join(' / ')}`)
    return
  }

  const forbidden = (reject ?? []).filter((token) => html.includes(token))
  if (forbidden.length > 0) {
    failures += 1
    console.log(`FAIL  ${label} — 不应出现: ${forbidden.join(' / ')}`)
    return
  }

  console.log(
    `PASS  ${label} — ${html.length} 字符，${expect.length} 项断言全部命中` +
      (reject?.length ? `，${reject.length} 项排除全部通过` : ''),
  )
}

for (const routeCase of cases) {
  verify(
    routeCase.path,
    () =>
      renderToString(
        <StaticRouter location={routeCase.path}>
          <AppRoutes />
        </StaticRouter>,
      ),
    routeCase.expect,
    routeCase.reject,
  )
}

for (const page of pages) {
  verify(page.name, page.render, page.expect, page.reject)
}

console.log(
  failures === 0
    ? `\n全站渲染校验通过（${cases.length} 条路由 + ${pages.length} 个组件直渲）`
    : `\n渲染校验失败 ${failures} 项`,
)
process.exit(failures === 0 ? 0 : 1)
