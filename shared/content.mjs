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
 * **内容条目（分类 / 标签 / 文章 / 项目 / 媒体）一律留空**：它们以数据库为准。
 * 曾经这里放着一批示例条目，而种子是「表为空就灌」的 —— 于是把库清空之后，
 * 下次启动它们又全回来了，「删干净」这件事永远不生效。现在这几个导出是空数组，
 * `seedIfEmpty()` 也不再往这五张表写：内容只由后台录入，只活在库里。
 *
 * 仍然回灌的有两类，性质都不是内容：
 *   - `settings` / `sections`：让站点跑得起来的默认配置（品牌、SEO、首页文案、简历），
 *     后台没有删除入口，因此不存在「删了又回来」；缺了它们新库连品牌名都没有。
 *   - `media`：随镜像发布的静态素材登记，后台删不掉（来源门 409），详见该项注释。
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

/**
 * 文章分类。
 *
 * **留空是刻意的**（理由见文件头「内容条目一律留空」）。分类与标签在后台
 * 「分类与标签」屏维护；写在这里的话，库被清空之后下次启动会悄悄补回来。
 */
export const categories = []

/**
 * 标签。
 *
 * 与分类的区别：分类是一篇一个（决定归档与列表筛选），标签是一篇多个（决定关键词）。
 * 前台在文章页底部展示标签；两者的增删改与排序在后台「分类与标签」屏。
 *
 * 同样留空：以库为准。
 */
export const tags = []

/**
 * 文章。**留空是刻意的**（理由见文件头）。
 *
 * 曾经这里放着 6 篇示例文章。种子是「表为空就灌」的，于是把库清空之后，
 * 下次启动这 6 篇又回来了 —— 「删干净了」这件事永远不会生效。
 * 现在文章只活在库里：要内容就在后台写，本文件不再提供。
 */
export const posts = []

/**
 * 项目。**留空是刻意的**（理由见文件头，与文章同理）。
 *
 * 项目字段的两个约定仍然有效，写内容时照着来：
 *   - `repoUrl` 只填**确实存在**的仓库地址。按 slug 拼一个 `github.com/<用户名>/<slug>`
 *     是最省事的写法，代价是每张卡片挂着一条 404 —— 读者会以为自己点错了，
 *     而真正的原因是这条地址从来没存在过。没有公开仓库的项目就让它没有链接。
 *   - 没有 stars / forks：这两个数没有来源，手填多少都是编的。
 */
export const projects = []

/**
 * `public/images` 下的静态素材，登记成媒体库的初始条目。
 *
 * **这是唯一还会回灌的条目**，理由与文章/项目不同：
 *   1. 它不是内容，是**随镜像一起发布的素材**（头像与 Hero 图）。文件本体在版本库里，
 *      运行期删掉会在下次构建时被拷回来；登记行同理。
 *   2. 后台**删不掉**它 —— 媒体删除的来源门对 `/images/*` 一律 409，界面按钮也是禁用的。
 *      所以它不会给人「删了又回来」的错觉：那道删除动作从来没有成功过。
 *   3. 「来源门」这条规则需要一条 `/images/*` 的样本才能被验证；素材登记被清空之后，
 *      全新库里就再也找不到这类条目，规则本身会退化成没有被测过的死代码。
 *
 * 文章封面（`post-*.png`）早已连文件一起移出，不在此列。
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
