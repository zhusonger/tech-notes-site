/**
 * 可编辑区块的**约束**规格 —— 服务端校验与后台界面共用这一份。
 *
 * 为什么共用：画布「首页内容」的字段都带字数计数（主标题 16 / 60），
 * 计数要一个上限、服务端拒收也要一个上限。两边各写一份，迟早出现
 * 「界面上还能敲，保存却被拒」。所以上限只声明一次：前端读它画计数，
 * 后端读它做校验。
 *
 * **这里只声明约束，不声明布局。** 布局（主标题两列、行动按钮两列、
 * 经历条目带增删）是画布逐屏画出来的，两屏各不相同；把它抽象成一套通用
 * 表单引擎，换来的复杂度会超过省下的代码。界面各写各的，约束共用。
 *
 * 键名用**点号路径**指向文档里的值（`primaryAction.to`）—— 库里存的是扁平文档
 * （`sections.hero` 直接就是 `{ name, latin, primaryAction, ... }`），
 * 前台按这个形状渲染，后台不能为了好写表单就把它改成嵌套的。
 *
 * 字段类型：
 *   text / textarea  文本；max 为字数上限
 *   url              图片或资源地址，只放行 `/` 开头或 http(s)://
 *   link             跳转链接，同样只放行 `/` 开头或 http(s)://
 *   bool             开关
 * 列表单独放在 `lists`：
 *   chips            字符串数组（技能、优势这类平铺标签）。`itemType: 'textarea'`
 *                    用于成句的条目（核心竞争力、经历要点），单行框会把整句截成一条缝
 *   records          对象数组（工作经历、数据条、技术栈条目）。
 *                    `itemFields` 是条目里的标量字段，`itemLists` 是条目里的**嵌套列表**
 *                    （工作经历条目下既有一串要点，又挂着若干项目），结构与外层同构。
 *   ids              取值受限的字符串数组（简历模块的顺序与显示状态）。`exhaustive: true`
 *                    表示必须不重不漏地列出全部取值 —— 顺序表少一项，前台就会少一节。
 *
 * `counters` 声明跨字段的联合上限（主标题 = 中文名 + 分隔符 + 拉丁名 ≤ 60），
 * 单看任一部分都验不出来。
 */

/**
 * 简历页正文的五个节。
 *
 * 这份清单同时是「后台模块结构面板的可拖动项」与「前台渲染顺序的取值范围」，
 * 所以只能有一份：两处各写一份，面板里就会出现前台并不存在的模块
 * （画布上正是如此 —— 它列了「项目经历」「开源贡献」，而这两节在本站已分别
 * 并入工作经历、并整节删除；见 README「未实现」）。
 *
 * `id` 是存进库里的值，`label` 只用于界面。
 */
export const RESUME_SECTIONS = [
  { id: 'summary', label: '个人概述' },
  { id: 'highlights', label: '核心竞争力' },
  { id: 'skills', label: '核心技能' },
  { id: 'experience', label: '工作经历' },
  { id: 'education', label: '教育背景与证书' },
]

export const RESUME_SECTION_IDS = RESUME_SECTIONS.map((s) => s.id)

/** 首页内容屏的模块页签顺序即此对象里 `module === 'home'` 的书写顺序。 */
export const SECTION_SPECS = {
  /* ------------------------------------------------------------ 首页 · 首屏 */
  hero: {
    module: 'home',
    label: '首屏',
    title: '首屏 · Hero',
    desc: '对应前台首页顶部的标题区，宽屏下与右侧配图并排显示',
    action: 'home_update',
    subject: '首屏',
    fields: {
      eyebrow: { max: 24 },
      name: { max: 20, required: true },
      latin: { max: 40 },
      subline: { max: 60 },
      paragraph: { max: 200 },
      trust: { max: 120 },
      /* 画布这一屏没画配图字段，但有「显示首屏配图」开关 —— 没有地方改地址的开关
         就是假开关。媒体库是后续一屏，这里先留地址输入位。 */
      image: { type: 'url', max: 300 },
      'primaryAction.label': { max: 20, required: true },
      'primaryAction.to': { type: 'link', max: 120, required: true },
      'secondaryAction.label': { max: 20, required: true },
      'secondaryAction.to': { type: 'link', max: 120, required: true },
      showImage: { type: 'bool' },
      showTrust: { type: 'bool' },
    },
    counters: {
      /* 画布口径：中文名 + 「 · 」+ 拉丁名 一起算进 60 */
      headline: { keys: ['name', 'latin'], separator: ' · ', max: 60, label: '主标题' },
    },
    labels: {
      name: '中文名',
      latin: '拉丁名',
      eyebrow: '眉标',
      subline: '副标题',
      paragraph: '介绍段落',
      trust: '数据背书',
      image: '配图地址',
      /* 记到顶层：改了按钮链接，日志里说「主按钮」就够，报「主按钮链接」反而要多读一眼 */
      primaryAction: '主按钮',
      secondaryAction: '次按钮',
      'primaryAction.label': '主按钮文案',
      'primaryAction.to': '主按钮链接',
      'secondaryAction.label': '次按钮文案',
      'secondaryAction.to': '次按钮链接',
      showImage: '显示首屏配图',
      showTrust: '显示数据背书',
    },
  },

  /* ---------------------------------------------------------- 首页 · 关于我 */
  about: {
    module: 'home',
    label: '关于我',
    title: '关于我 · About',
    desc: '首页中段的自我介绍区块。姓名、头衔、城市、邮箱、头像与简介来自「站点设置 → 作者资料」，这里不重复维护',
    action: 'home_update',
    subject: '关于我',
    fields: {
      skillsNote: { max: 120 },
    },
    lists: {
      skills: { type: 'chips', itemMax: 24, maxItems: 24, label: '技能清单' },
      strengths: { type: 'chips', itemMax: 40, maxItems: 12, label: '优势清单' },
      experience: {
        type: 'records',
        maxItems: 12,
        label: '经历条目',
        itemLabel: '段经历',
        itemFields: {
          date: { max: 40, required: true, label: '时间' },
          company: { max: 60, required: true, label: '公司' },
          role: { max: 60, label: '职位' },
          description: { max: 240, label: '说明' },
        },
      },
      stats: {
        type: 'records',
        maxItems: 8,
        label: '数据条',
        itemLabel: '个数据条',
        itemFields: {
          value: { max: 12, required: true, label: '数值' },
          label: { max: 24, required: true, label: '说明' },
        },
      },
    },
    labels: { skillsNote: '技能补注' },
  },

  /* ---------------------------------------------------------- 首页 · 技术栈 */
  stack: {
    module: 'home',
    label: '技术栈',
    title: '技术栈 · Stack',
    desc: '首页底部的技术栈网格，每项由名称与一行小字说明组成',
    action: 'home_update',
    subject: '技术栈',
    fields: {
      note: { max: 40 },
    },
    lists: {
      items: {
        type: 'records',
        maxItems: 30,
        label: '技术栈条目',
        itemLabel: '项技术',
        itemFields: {
          name: { max: 24, required: true, label: '名称' },
          sub: { max: 24, label: '方向说明' },
        },
      },
    },
    labels: { note: '网格补注' },
  },

  /* ------------------------------------------------------------ 简历 · 概要 */
  resumeSummary: {
    module: 'resume',
    label: '概要',
    title: '概要 · Summary',
    /*
     * 画布这一页签画的是「姓名 / 头衔 / 一句话简介 / 当前状态 / 所在城市 / 头像 + 两个开关」，
     * 全都不在这里 —— 前五项是站点级事实（`site_settings` → 作者资料，简历页抬头、
     * 首页名片、文章作者卡共用一份），两个开关则没有对应的前台元素（简历页刻意不提供
     * 下载入口，也没有「最近更新日期」这行字）。界面上把它们显示成只读并指路，
     * 不在这里再抄一份、也不摆点不动的开关。理由与「不造假开关」同源，见 README。
     */
    desc: '简历页顶部的标题区与个人概述。姓名、头衔、城市、邮箱、头像来自「站点设置 → 作者资料」，这里不重复维护',
    action: 'resume_save',
    subject: '概要',
    fields: {
      eyebrow: { max: 24 },
      title: { max: 24, required: true },
      description: { max: 160 },
      summary: { type: 'textarea', max: 800 },
    },
    lists: {
      /* 成句的要点（每条一两百字）：单行输入框会把句子截成一条缝，用两行的 */
      highlights: { type: 'chips', itemType: 'textarea', itemMax: 240, maxItems: 10, label: '核心竞争力' },
    },
    labels: {
      eyebrow: '眉标',
      title: '页面标题',
      description: '一行定位',
      summary: '个人概述',
    },
  },

  /* -------------------------------------------------------- 简历 · 工作经历 */
  resumeExperience: {
    module: 'resume',
    label: '工作经历',
    title: '工作经历 · Experience',
    desc: '按时间倒序排列的任职记录，每段可再挂若干项目；前台顺序即这里的排列顺序',
    action: 'resume_save',
    subject: '工作经历',
    lists: {
      jobs: {
        type: 'records',
        maxItems: 12,
        label: '工作经历',
        itemLabel: '段经历',
        itemFields: {
          date: { max: 40, required: true, label: '时间' },
          title: { max: 80, required: true, label: '公司 · 职位' },
        },
        itemLists: {
          bullets: { type: 'chips', itemType: 'textarea', itemMax: 240, maxItems: 12, label: '经历要点' },
          projects: {
            type: 'records',
            maxItems: 8,
            label: '项目',
            itemLabel: '个项目',
            itemFields: {
              name: { max: 80, required: true, label: '项目名' },
            },
            itemLists: {
              bullets: { type: 'chips', itemType: 'textarea', itemMax: 240, maxItems: 12, label: '项目要点' },
            },
          },
        },
      },
    },
  },

  /* ------------------------------------------------------ 简历 · 技能与教育 */
  resumeSkills: {
    module: 'resume',
    label: '技能与教育',
    title: '技能与教育 · Skills',
    /* 教育背景来自站点级事实（首页「关于我」与简历页共用），因此这里只看不改 */
    desc: '技能表每行由分类名与内容组成。学校、专业与证书来自「站点设置」，首页与简历页共用一份，这里只看不改',
    action: 'resume_save',
    subject: '技能与教育',
    lists: {
      rows: {
        type: 'records',
        maxItems: 20,
        label: '技能行',
        itemLabel: '行技能',
        itemFields: {
          label: { max: 24, required: true, label: '分类' },
          value: { max: 240, required: true, label: '内容' },
        },
      },
    },
  },

  /* -------------------------------------------------------- 简历 · 联系方式 */
  resumeContact: {
    module: 'resume',
    label: '联系方式',
    title: '联系方式 · Contact',
    desc: '控制简历页抬头显示哪几项。邮箱、城市、GitHub 的取值来自「站点设置」，这里只决定显示与否',
    action: 'resume_save',
    subject: '联系方式',
    fields: {
      showEmail: { type: 'bool' },
      showLocation: { type: 'bool' },
      showGithub: { type: 'bool' },
      pdfHint: { type: 'bool' },
    },
    labels: {
      showEmail: '显示邮箱',
      showLocation: '显示城市',
      showGithub: '显示 GitHub',
      pdfHint: '显示 PDF 索取提示',
    },
  },

  /* -------------------------------------------------------- 简历 · 模块结构 */
  resumeLayout: {
    module: 'resume',
    /*
     * 不进左侧页签，它属于右侧的「模块结构」面板。
     * 画布上顺序是可拖的，隐藏状态只在那句提示文案里出现过（列表行没画控件）——
     * 提示既然承诺了「设置为隐藏的模块只在后台保留」，这个能力就得真的有，
     * 所以面板每行补一个显示 / 隐藏按钮。
     */
    panelOnly: true,
    label: '模块结构',
    title: '模块结构',
    desc: '拖动调整前台展示顺序；隐藏的模块只在后台保留，不会出现在前台',
    action: 'resume_save',
    subject: '模块结构',
    lists: {
      order: {
        type: 'ids',
        maxItems: 12,
        values: RESUME_SECTION_IDS,
        exhaustive: true,
        label: '模块顺序',
      },
      hidden: {
        type: 'ids',
        maxItems: 12,
        values: RESUME_SECTION_IDS,
        label: '隐藏的模块',
      },
    },
    labels: { order: '展示顺序', hidden: '显示状态' },
  },
}

/** 允许写入 `site_sections` 的键。不在这张表里的一律拒绝 —— 它决定的是「能改什么」。 */
export const EDITABLE_SECTION_KEYS = Object.keys(SECTION_SPECS)

/**
 * 有区块归属的后台屏。由规格推导而不是另写一份清单 ——
 * 简历屏做完时这里自动多一个 'resume'，不会两处说岔。
 */
export const SECTION_MODULES = [...new Set(Object.values(SECTION_SPECS).map((s) => s.module))]

export function getSectionSpec(key) {
  return Object.prototype.hasOwnProperty.call(SECTION_SPECS, key) ? SECTION_SPECS[key] : null
}

/** 某个后台屏下的模块页签，顺序稳定（对象书写顺序即界面顺序）。 */
export function sectionsForModule(module) {
  return Object.entries(SECTION_SPECS)
    .filter(([, spec]) => spec.module === module)
    .map(([key, spec]) => ({ key, ...spec }))
}

/** 该屏的模块页签（排除只服务于侧栏面板的区块，如简历的「模块结构」）。 */
export function tabsForModule(module) {
  return sectionsForModule(module).filter((s) => !s.panelOnly)
}

/** 该屏的侧栏面板区块；没有就返回 null。目前只有简历屏用到。 */
export function panelForModule(module) {
  return sectionsForModule(module).find((s) => s.panelOnly) ?? null
}

/**
 * 按点号路径取值。缺任何一层都返回 undefined（不抛）——
 * 校验一份不完整的载荷是常态，不是异常。
 */
export function readPath(doc, path) {
  let cur = doc
  for (const part of String(path).split('.')) {
    if (cur === null || typeof cur !== 'object') return undefined
    cur = cur[part]
  }
  return cur
}

/** 主标题那类联合计数：各段拼接后的长度（分隔符也算，与画布口径一致）。 */
export function counterLength(doc, counter) {
  const parts = counter.keys.map((k) => String(readPath(doc, k) ?? ''))
  return parts.join(counter.separator ?? '').length
}
