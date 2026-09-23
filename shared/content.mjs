/**
 * 站点初始内容的**唯一来源**。
 *
 * 为什么放在 `shared/` 而不是各写一份：
 *   1. 建库种子（`server/db.mjs` 的 `seedIfEmpty`）与前台兜底（`src/data/site.ts` 的
 *      `DEFAULT_CONTENT`）必须来自同一份内容。拆成两份的那天起就开始漂移 ——
 *      而漂移是**静默**的：种子改了、兜底没改，前台照样能跑，只有断网时才会露出旧文案，
 *      没人会去查。
 *   2. `check:routes` 断言的是「兜底内容能正确渲染」，而冒烟测试断言的是
 *      「库里内容与兜底结构一致」。两者共用一个来源，这两条断言才同时成立。
 *
 * 这里只存**初始**内容：库建好之后，内容以数据库为准。
 * 改了本文件**不会**影响已建好的库（种子是幂等的，只在表为空时写入）。
 *
 * 三类数据分开存，各自的表不同：
 *   - `settings`    单项事实 → `site_settings`（一行一键，可直接读写单个值）
 *   - `sections`    结构化区块 → `site_sections`（一键一份 JSON 文档）
 *   - 其余（分类/标签/文章/项目/媒体）→ 各自的表，是「多条记录」而不是文档
 */

/**
 * 单项事实。键名即 `site_settings.key`。
 *
 * 这里是**示例内容**：只在库为空时写入一次（见 `seedIfEmpty`），之后以数据库为准。
 * 因此写在这里的应当是「别人 clone 下来能直接跑起来」的中性样例，
 * 而不是任何具体个人的身份与履历。
 */
export const settings = {
  // ---------------------------------------------------------------- 站点标识
  brand: '示例作者 · Tech Notes',
  description: '记录工程实践与思考的个人技术主页。',
  tagline: '把复杂的事做简单',
  language: 'zh-CN',
  timezone: 'Asia/Shanghai',
  logo: '/images/logo.png',
  maintenance: '0',
  /** 仪表盘「本周完成」的分母；改这里即可，不要在代码里写死。 */
  weeklyTarget: '10',

  // ---------------------------------------------------------------- 页脚
  footerQuote: '代码不止是职业，更是一种生活方式。',
  footerNote: '把复杂的事情做简单，把重复的事情自动化。长期记录工程实践与思考。',
  copyright: '2026 示例作者 · Tech Notes · 保留所有权利。',

  // ---------------------------------------------------------------- SEO 与元信息
  seoTitle: '示例作者 · Tech Notes',
  seoDescription: 'Android 工具链、自托管与前端工程的实践记录：把踩过的坑写成可复用的方法。',
  seoKeywords: 'Android, 工具链, 自托管, 前端工程, 自动化',
  ogImage: '/images/hero-workspace.png',

  // ---------------------------------------------------------------- 域名与部署
  /*
   * 两个地址都留空：空值时前台退化成相对链接，不会拼出一个错误域名。
   * 部署后由后台「站点设置 → 域名与部署」填成自己的地址。
   */
  siteUrl: '',
  repoUrl: '',

  // ---------------------------------------------------------------- 作者资料
  author: '示例作者',
  role: 'Android 高级工程师',
  location: '示例城市',
  email: 'you@example.com',
  github: 'github.com/your-name',
  avatar: '/images/portrait.png',
  /*
   * 这段文字同时出现在首页「关于我」名片与文章页的作者卡上。
   * 早先两处各存一份，改一处另一处就过期 —— 现在只有这一个来源。
   */
  bio: '让技术不止能跑通，还能被长期维护。喜欢把重复劳动熬成工具，把复杂问题拆成可读的模块。',

  /*
   * 教育背景放这里而不是放进某个页面的区块：首页「关于我」与简历页都要显示它，
   * 分两处存必然出现「简历更新了、首页还是旧学校」。
   */
  educationSchool: '示例大学',
  educationMajor: '计算机科学与技术 · 软件工程 · 本科',
  educationDate: '20XX 年毕业',
  educationCert: '软考高项：信息系统项目管理师（高级资格）',
}

/** 结构化区块。键名即 `site_sections.key`。 */
export const sections = {
  /** 首页首屏（画布「首页内容 → 首屏」模块） */
  hero: {
    eyebrow: '你好，我是',
    name: '示例作者',
    latin: 'Tech Notes',
    subline: 'Android 高级工程师 · 音视频与多媒体渲染方向',
    paragraph:
      '把重复劳动交给自动化，把复杂问题拆成可维护的模块。这里是我的技术笔记、项目实践与思考沉淀。',
    trust: '十余年 Android 研发经验 · 音视频与多媒体渲染专长 · 大型产品历练',
    image: '/images/hero-workspace.png',
    primaryAction: { label: '查看简历', to: '/resume' },
    secondaryAction: { label: '阅读博客', to: '/blog' },
    showImage: true,
    showTrust: true,
  },

  /**
   * 首页「关于我」区块。
   *
   * 画布的「首页内容」只设计了「首屏」那一个页签的字段，关于我 / 技术栈 / 页脚
   * 三个页签没有画。这里按**现有渲染**反推字段，不新增页面上没出现过的东西。
   *
   * 这里**没有**姓名 / 头衔 / 城市 / 邮箱 / 头像 / 简介：它们是站点级事实
   * （`site_settings` → 作者资料），首页名片与文章作者卡都从那里取。
   * 抄一份到这里，就会出现「站点设置改了、首页还是旧的」。
   */
  about: {
    skills: [
      'Android',
      'Kotlin',
      'Java',
      'Dart / Flutter',
      'C / C++',
      'OpenGL ES',
      'FFmpeg',
      'MediaCodec',
      'libpag',
      'Unity3D',
    ],
    skillsNote: '保持工程习惯：能自动化的一律自动化，能复用的绝不重写。',
    experience: [
      {
        date: '2022.12 — 2026.08',
        company: '示例科技 · 视频产品线',
        role: 'Android 开发 · 海外 AI 视频生成',
        description:
          '负责海外视频产品 Android 端；基于 libpag 搭建特效玩法与视频导出能力，沉淀 OpenGL ES 渲染层，特效合成效率提升 5 倍。',
      },
      {
        date: '2020.05 — 2022.10',
        company: '示例网络',
        role: 'Android & Flutter 开发',
        description:
          '负责社交与互动类产品的迭代；实现 Unity3D 与视频能力的跨进程画面合成，基于 FFmpeg 打通双端视频导出。',
      },
      {
        date: '2015.10 — 2020.05',
        company: '示例直播',
        role: 'Android 组主管',
        description:
          '负责千万级 DAU 直播产品的录制与直播功能；带团队完成版本迭代，搭建私有 Maven 仓库推动核心代码复用。',
      },
    ],
    strengths: [
      '多平台开发经验，技术视野较全面',
      '喜欢把流程沉淀成可复用的工具',
      '长期输出技术文章，乐于分享复盘',
      '注重协作规范，推动团队工程化',
    ],
    /*
     * 数据条。「50+ 技术文章」「12+ 个人项目」是建站时的示意值（README 已记），
     * 现在它们是可编辑内容，作者可以直接改成真值或收敛成能力描述。
     */
    stats: [
      { value: '10+', label: 'Android 研发经验' },
      { value: '3', label: '段核心研发经历' },
      { value: '50+', label: '技术文章' },
      { value: '12+', label: '个人项目' },
    ],
  },

  /** 首页「技术栈」区块 */
  stack: {
    items: [
      { name: 'Android', sub: '移动端开发' },
      { name: 'Kotlin', sub: '首选语言' },
      { name: 'Java', sub: '工程语言' },
      { name: 'OpenGL ES', sub: '图形与渲染' },
      { name: 'FFmpeg', sub: '音视频编解码' },
      { name: 'MediaCodec', sub: '硬编解码' },
      { name: 'libpag', sub: '特效与导出' },
      { name: 'Flutter', sub: '跨端开发' },
      { name: 'Unity3D', sub: '3D 与虚拟形象' },
      { name: 'C / C++', sub: '底层与 JNI' },
    ],
    note: '持续补充中',
  },

  /** 简历页抬头与概述（画布「简历编辑 → 概要」模块） */
  resumeSummary: {
    eyebrow: '详细履历',
    title: '简历',
    description: '十余年 Android 研发经验 · 音视频与多媒体渲染',
    summary:
      '十余年 Android 开发经验，覆盖直播、社交、游戏、AI 视频生成等方向，具备大型产品与海外出海产品的架构与落地经验。精通 OpenGL ES / FFmpeg / MediaCodec / libpag 多媒体与特效渲染，擅长跨进程音视频合成、编解码与性能优化；熟悉 Flutter 跨端开发与 Unity3D 接入。熟练运用 AI 编码工具主导重构与提效，具备团队管理与跨部门协作经验。',
    highlights: [
      '十余年 Android 研发经验，贯穿大型产品：曾任大型直播产品 Android 组主管、海外 AI 视频产品核心开发，覆盖直播、社交、游戏、AI 视频生成等方向。',
      '音视频与多媒体渲染专长：精通 OpenGL ES / FFmpeg / MediaCodec / libpag，具备跨进程音视频合成、多线程编解码、多声道混音与音视频同步的完整落地经验。',
      '架构设计与能力沉淀：主导首页多版本架构重构，支撑多业务版本并行与快速 A/B 实验；抽象 OpenGL ES 渲染层与 libpag 导出方案，形成可跨业务复用的基础能力。',
      'AI 提效与团队管理：熟练运用 AI 编码工具主导重构与提效；具备带团队完成版本迭代、攻关项目难点与跨部门协作的实践经验。',
    ],
  },

  /** 简历页工作经历（画布「简历编辑 → 工作经历」模块） */
  resumeExperience: {
    jobs: [
      {
        date: '2022.12 — 2026.08',
        title: '示例科技 · 视频产品线 · Android 开发',
        bullets: [],
        projects: [
          {
            name: '海外 AI 视频产品 Android 端',
            bullets: [
              '主导日活十万级 / 月活百万级海外视频产品 Android 端的核心功能开发与版本迭代。',
              '主导首页多版本架构设计与重构，支撑多业务版本并行与快速 A/B 实验。',
              '基于 OpenGL ES 自研核心特效玩法，覆盖实时滤镜、贴纸、特效合成等完整渲染链路。',
              '基于 libpag 搭建特效玩法后端服务，实现仅商业版 libpag 支持的视频导出能力，补齐端外分享闭环。',
            ],
          },
          {
            name: '技术亮点与成果',
            bullets: [
              '借助 AI 编码工具承接首页重构的大部分代码实现，显著缩短交付周期。',
              '特效玩法合成效率提升 5 倍；应用 ANR 率降低 1%，稳定性显著改善。',
              '沉淀 OpenGL ES 特效渲染层与 libpag 导出方案，形成可复用能力，支撑后续玩法快速接入。',
            ],
          },
        ],
      },
      {
        date: '2020.05 — 2022.10',
        title: '示例网络 · Android & Flutter 开发',
        bullets: [],
        projects: [
          {
            name: '多人互动交友产品',
            bullets: [
              '实现 Android & iOS 双端 Unity3D 小游戏画面与第三方视频能力的跨进程合成，方案对标小游戏跨进程直播。',
            ],
          },
          {
            name: '匿名社交产品',
            bullets: [
              '负责 App 功能迭代与全新改版，实现匿名用户匹配、语音聊天与动态展示。',
              '实现 IM 语音、图片、文字聊天等核心能力。',
            ],
          },
          {
            name: '绘画接龙 / 桌游合集',
            bullets: [
              '一周内熟悉 Flutter 并投入功能开发；基于 FFmpeg 实现双端画笔内容导出视频分享。',
              '基于 MGOBE 对战引擎 + Flame 游戏引擎实现联机对战小游戏模块；熟悉 FFmpeg 源码编译精简与视频剪辑转码。',
              '负责 Flame 桌游模拟器通用功能开发与效果优化，完成海外版功能迭代。',
            ],
          },
        ],
      },
      {
        date: '2015.10 — 2020.05',
        title: '示例直播 · Android 组主管',
        bullets: [],
        projects: [
          {
            name: '直播与录屏产品',
            bullets: [
              '负责千万级 DAU 直播产品的录制与直播功能开发。',
              '带领团队完成各版本功能迭代，主导攻关项目难点与历史遗留问题。',
              '搭建私有 Maven 仓库，抽取核心代码成库以便复用；重构录制端代码组件化，实现多渠道代码复用。',
              '熟练应用 OpenGL ES 实现视频流修改，多线程 MediaCodec 编解码、混音、音视频同步。',
            ],
          },
          {
            name: '虚拟形象直播',
            bullets: [
              '负责基于 ijkplayer 的观看与用户偏好算法支持。',
              '负责 Unity3D 虚拟形象直播、形象装扮与整体框架搭建、核心功能开发。',
              '抽象 OpenGL ES 直播底层库，降低 Texture 操作开发难度；攻克多声道、不同采样率音频混音需求。',
              '协调项目组资源，采用增量模型固定递交可测试版本。',
            ],
          },
        ],
      },
      {
        date: '2014.03 — 2015.10',
        title: '示例游戏 · Android 开发工程师',
        bullets: [
          '负责游戏产品双端（Android & iOS）快速开发上线，并兼顾后端接口与运营网页开发部署。',
          '作为 Android SDK & Unity3D 工程师，抽象统一接口实现各分发平台登录与支付逻辑一致。',
        ],
      },
      {
        date: '2012.09 — 2014.03',
        title: '示例软件 · Android 工程师',
        bullets: ['负责定制化平板办公软件开发，涉及插件化模块开发与多样化自定义控件。'],
      },
    ],
  },

  /** 简历页核心技能（画布「简历编辑 → 技能与教育」模块） */
  resumeSkills: {
    rows: [
      { label: '开发语言', value: 'Java · Kotlin · Dart（Flutter）· C · C++ · Python · JavaScript · Shell' },
      { label: '平台与端', value: 'Android · iOS · Linux · macOS' },
      { label: '多媒体与渲染', value: 'OpenGL ES · FFmpeg · MediaCodec · libpag' },
      { label: '架构与工程', value: '组件化 · 插件化 · 私有 Maven 仓库 · Gradle 字节码插桩（javassist）' },
      { label: '游戏与跨端', value: 'Unity3D 接入 · Flutter · Flame · MGOBE 对战引擎' },
      { label: 'AI 提效', value: 'Codex CLI 等 AI 编码工具的工程化落地实践' },
      { label: '工具链', value: 'Android Studio · Xcode · Unity3D · VSCode · Git · SVN · Jenkins' },
    ],
  },

  /**
   * 简历页联系方式（画布「简历编辑 → 联系方式」模块）。
   *
   * 只存「显示哪些、怎么显示」：邮箱 / GitHub / 城市本身就是站点级事实，
   * 存在 `site_settings` 里，这里再抄一份就会出现两处不一致。
   *
   * 没有「下载简历」开关：简历页刻意不提供下载与打印入口（见 README 与 check:routes
   * 的排除断言），加一个开关却没有对应文件，就是能点但不生效的假入口。
   */
  resumeContact: {
    showEmail: true,
    showLocation: true,
    showGithub: true,
    // 简历页底部那句「发邮件索取 PDF 版本」的补充说明
    pdfHint: true,
  },
}

/** 文章分类。前台筛选条即由此派生（不再手写一份）。 */
export const categories = ['Android', '前端工程', '自托管', '工具链', '设计工程']

/**
 * 标签。
 *
 * 与分类的区别：分类是一篇一个（决定归档与列表筛选），标签是一篇多个（决定关键词）。
 * 前台在文章页底部展示标签；两者的增删改与排序在后台「分类与标签」屏。
 */
export const tags = ['adb', '自动化', '排版', 'PDF']

/**
 * 文章。
 *
 * 数值口径（不假装精确）：`views` 由原展示串 '1.8k 阅读' 换算而来，是建站时的基线，
 * 不是真实统计 —— 真实阅读统计尚未接入，README 里已记为待办。
 *
 * `body` 是 Markdown。**只有真正写过的文章才有正文**：其余留空，
 * 文章页会如实显示「正文尚未撰写」，而不是拿别人的文章顶上。
 * 阅读时长由正文长度派生（`shared/derive.mjs`），不单独存列。
 *
 * `coverImage` 留空是**有意的**，不是漏填：这几篇都没有专属封面图，卡片会回退
 * `cover-default.svg`（六张 `post-*.png` 已随本次改动从仓库移出）。
 */
export const posts = [
  {
    slug: 'reusable-skill',
    title: '把重复操作封装成可复用的技能',
    category: '工具链',
    excerpt: '从采集、拼接到排版：一次踩坑，长期受益的自动化套路。',
    coverImage: '',
    publishedAt: '2026-08-24T09:00:00.000Z',
    views: 1800,
    seoDescription: '',
    tags: ['adb', '自动化', '排版'],
    body: [
      '每次遇到「把手机里的长列表导出来打印」这个需求，大多数人都会临时写一段脚本，用完就丢。在第八次重写同一段滚动逻辑之后，我决定把它做成一个可以被反复调用的能力。',
      '',
      '## 重复劳动的三个信号',
      '',
      '当一件事同时满足「步骤固定」「输入参数少」「每月至少发生一次」三个条件时，它就该被封装。临时脚本的问题不在写得慢，而在于每次都要重新踩一遍同样的坑。',
      '',
      '```bash',
      "$ capture-long-list 'adb shell input swipe 540 1600 540 600 300'",
      '# 1. 逐屏截图，同时记录当前 scrollTop',
      '# 2. 以固定位移拼接，重叠区域做像素去重',
      '# 3. 按 A4 可打印高度切分，输出满版 PDF',
      '```',
      '',
      '> 能被复用的前提，是把「我知道怎么做」写进「工具知道怎么做」。',
      '',
      '## 拆成三段来做',
      '',
      '- 采集：固定位移滚动，逐屏截图并记录偏移量，不依赖任何 UI 控件。',
      '- 拼接：按重叠区域做像素去重，长图既不重复也不失真。',
      '- 输出：按 A4 可用高度分页，支持按年度与月份分册打印。',
      '',
      '## 回看这次封装',
      '',
      '封装的价值不在代码量，而在于把「我这次是怎么做的」变成「任何人下次都能这么做」。工具越具体，复用率越高；越通用，反而越没人用。',
      '',
      '## 附：完整脚本与参数说明',
      '',
      '完整脚本、参数说明与踩坑记录整理在项目的 README 中，可直接按需取用。',
    ].join('\n'),
  },
  {
    slug: 'self-hosted-ci-traps',
    title: '自托管 CI 的表达式陷阱与规避',
    category: '自托管',
    excerpt: 'workflow_dispatch 输入不可用时，用环境变量兜底的两段式写法。',
    coverImage: '',
    publishedAt: '2026-07-11T09:00:00.000Z',
    views: 2400,
    seoDescription: '',
    tags: [],
    body: '',
  },
  {
    slug: 'pixel-parity-audit',
    title: '设计稿与实现之间，还差一次像素对账',
    category: '设计工程',
    excerpt: '用截图取证，把「差不多」变成可量化的偏差清单。',
    coverImage: '',
    publishedAt: '2026-06-02T09:00:00.000Z',
    views: 1300,
    seoDescription: '',
    tags: [],
    body: '',
  },
  {
    slug: 'adb-long-list',
    title: '用 adb 批量采集长列表的正确姿势',
    category: '工具链',
    excerpt: '滚动、去重、拼接：三个阶段各自的坑与规避方式。',
    coverImage: '',
    publishedAt: '2026-05-19T09:00:00.000Z',
    views: 3100,
    seoDescription: '',
    tags: [],
    body: '',
  },
  {
    slug: 'faster-pipeline',
    title: '让构建流水线快 40% 的四次改动',
    category: '工具链',
    excerpt: '缓存命中率、镜像复用与并行阶段的实际收益拆解。',
    coverImage: '',
    publishedAt: '2026-04-07T09:00:00.000Z',
    views: 2000,
    seoDescription: '',
    tags: [],
    body: '',
  },
  {
    slug: 'single-host-services',
    title: '单机跑十个服务的资源分配实践',
    category: '自托管',
    excerpt: '内存、端口与反向代理的取舍，以及监控最小集。',
    coverImage: '',
    publishedAt: '2026-03-12T09:00:00.000Z',
    views: 1500,
    seoDescription: '',
    tags: [],
    body: '',
  },
]

/**
 * 项目。
 *
 * `featured` 决定首页「精选项目」显示哪几个；没有标记精选时前台退化为按排序取前 3，
 * 不会出现首页空一块。前台项目页的筛选条由 `language` 派生。
 */
export const projects = [
  {
    slug: 'a4-print',
    title: 'Android 长列表 A4 打印工具链',
    description:
      '用 adb 滚动采集 App 长列表，像素级拼接后自动排成 A4 满版 PDF，支持按年度与月份分册。',
    tags: 'TypeScript · adb · Pillow',
    language: 'TypeScript',
    stars: 1200,
    forks: 186,
    featured: true,
  },
  {
    slug: 'windows-vm',
    title: 'Windows 虚拟机容器化部署方案',
    description:
      '在 Debian 宿主机上用容器跑起 Windows 虚拟机，KVM 加速、磁盘落点到 RDP 验收全流程脚本化。',
    tags: 'Shell · Docker · KVM',
    language: 'Shell',
    stars: 486,
    forks: 64,
    featured: true,
  },
  {
    slug: 'pixel-parity',
    title: '设计稿像素级对齐校验器',
    description: '驱动无头浏览器截图并做像素取证，把设计稿与实现之间的偏差变成可量化的修复清单。',
    tags: 'TypeScript · Playwright · Canvas',
    language: 'TypeScript',
    stars: 268,
    forks: 42,
    featured: true,
  },
  {
    slug: 'selfhost-scaffold',
    title: '自托管服务部署脚手架',
    description: '一套 Compose 模板与运维脚本，把反向代理、证书续期、定时备份与基础监控一次配好。',
    tags: 'Shell · Docker · Nginx',
    language: 'Shell',
    stars: 742,
    forks: 98,
    featured: false,
  },
  {
    slug: 'usb-token-check',
    title: 'macOS USB 令牌识别诊断工具',
    description: '只读判定 USB 安全令牌能否作为智能卡被系统识别，输出可直接定位问题的诊断报告。',
    tags: 'Python · PC/SC · macOS',
    language: 'Python',
    stars: 196,
    forks: 27,
    featured: false,
  },
  {
    slug: 'skill-workflow',
    title: '技能库与自动化工作流集',
    description: '把日常重复操作沉淀成可复用技能，覆盖采集、拼接、排版、校验与发布全流程。',
    tags: 'TypeScript · Node.js · CLI',
    language: 'TypeScript',
    stars: 1600,
    forks: 204,
    featured: false,
  },
]

/**
 * `public/images` 下的静态资源，登记成媒体库的初始条目。
 *
 * 文章封面（`post-*.png`）本次已连文件一起移出：卡片在无封面时走
 * `cover-default.svg`，留着一批「只为每篇配一张」而存在的图，反而让「没配图」
 * 看起来像坏了。**文章侧的 `coverImage` 必须同步清空** —— 它不是空串时
 * `post.image` 为非空值，会绕过默认封面直连一个已删除的地址（404 破图）。
 * 后台媒体库里的旧行也一并清掉，否则列表里会挂着六条指向不存在文件的登记。
 */
export const media = [
  { filename: 'hero-workspace.png', alt: '首页 Hero 工作台配图' },
  { filename: 'portrait.png', alt: '头像' },
]

/**
 * 完整内容文档。
 *
 * 服务端把它灌进库（`seedIfEmpty`），再把库里的同形状文档交给
 * `presentContent()` 生成接口响应；前台在接口不可用时直接用本文件生成兜底内容。
 * 两侧走同一个 `presentContent()`，所以「兜底」与「线上」在结构上不可能不一致。
 */
export const content = { settings, sections, categories, tags, posts, projects, media }
