/**
 * 分类与标签的**名字规则与近重复判定**。
 *
 * 与 `shared/media.mjs` 同一条理由：界面上「最多 24 个字」的提示与「已存在同名标签」的
 * 判据，必须与后端拒收用的是同一份。两处各写一遍，改一处就开始说谎。
 *
 * 标签的 `name` 在库里是 UNIQUE，所以**一模一样的名字**根本进不来；真正会攒下来的是
 * **近重复** —— `TypeScript` / `typescript` / `type script` 三条并存，各自挂着几篇文章。
 * 它们不是同一个串，任何唯一约束都拦不住，只能靠归一化后分组识别。
 * 归一化口径就放在这里，供两侧共用：界面上算「有没有相近的标签」，服务端算「合并哪几组」。
 *
 * 这一份只放**常量与纯函数**，不碰 fs / db：它要能在浏览器里跑。
 */

/** 分类名上限。与 `server/taxonomy.mjs` 的校验同源。 */
export const CATEGORY_NAME_MAX = 24
/** 标签名上限。 */
export const TAG_NAME_MAX = 24

/** 下发到界面的策略。界面上的计数提示读它，不另写一份数字。 */
export const TAXONOMY_POLICY = {
  categoryNameMax: CATEGORY_NAME_MAX,
  tagNameMax: TAG_NAME_MAX,
}

/**
 * 归一化：全角转半角 → 去掉所有空白 → 去掉分隔符类字符 → 统一小写。
 *
 * 为什么连 `-` 和 `_` 也要去掉：`Type-Script`、`type_script`、`TypeScript` 在标签里
 * 是同一样东西。留着分隔符就等于放过一半的重复。
 *
 * 不做同义词归一（`js` 与 `javascript` 不合并）：那需要一张词典，而词典一旦写错，
 * 两个本不相同的标签会被悄悄并到一起 —— 归一化必须只依赖字符本身。
 */
export function normalizeName(raw) {
  return String(raw ?? '')
    .replace(/[\u3000\u00a0]/g, ' ')
    /* 全角 ASCII（！ 到 ～）整体左移 0xFEE0 就落到半角区间 */
    .replace(/[\uff01-\uff5e]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/\s+/g, '')
    .replace(/[-_·・./\\()（）[\]【】]+/g, '')
    .toLowerCase()
}

/**
 * 校验一个分类名 / 标签名。
 *
 * 内部的连续空白折成一个空格：名字会出现在前台的筛选条上，多打一个空格看不出差别，
 * 但它会让两条本该相同的名字变成两个。
 */
export function validateTaxonomyName(raw, max, label) {
  const value = String(raw ?? '').trim().replace(/\s+/g, ' ')
  if (!value) return { error: `${label}不能为空` }
  if (value.length > max) return { error: `${label}最多 ${max} 个字` }
  if (/[\u0000-\u001f\u007f]/.test(value)) return { error: `${label}含有不可见字符` }
  return { value }
}

/** 名字里带大写字母（`TypeScript` 这种专名）。CJK 名一律为 false。 */
const hasUpper = (name) => /[A-Z]/.test(String(name))

/**
 * 同一组里保留谁。
 *
 * 依次比：**用得多** → **写成专名的那个** → **早创建的**。
 * 第二条不是多余的：`typescript`（3 篇）与 `TypeScript`（3 篇）打平时，
 * 留下 `typescript` 会让前台标签云里全是小写，而这类标签的正常写法就是专名。
 */
const compareMembers = (a, b) =>
  b.count - a.count || Number(hasUpper(b.name)) - Number(hasUpper(a.name)) || a.id - b.id

/**
 * 找出近重复的标签组。
 *
 * @param {{id: number, name: string, postCount?: number}[]} tags
 * @returns {{key: string, keeper: object, drop: object[]}[]} 只返回**两个及以上**的分组；
 *   没有重复时是空数组 —— 界面上那颗「合并重复标签」据此如实置灰，而不是点下去没反应。
 */
export function duplicateGroups(tags) {
  const buckets = new Map()
  for (const t of tags ?? []) {
    const key = normalizeName(t?.name)
    if (!key) continue
    const member = { id: t.id, name: t.name, count: Number(t.postCount) || 0 }
    if (!buckets.has(key)) buckets.set(key, [])
    buckets.get(key).push(member)
  }

  const groups = []
  for (const [key, members] of buckets) {
    if (members.length < 2) continue
    members.sort(compareMembers)
    groups.push({ key, keeper: members[0], drop: members.slice(1) })
  }
  return groups
}

/**
 * 一组合并写成一句话，如 `TypeScript ← typescript（3 篇）、ts（1 篇）`。
 *
 * 确认弹层与审计详情共用这一句 —— 它们说的是同一件事，写成两种样子就会有人
 * 以为弹层里承诺的和日志里记下的不是一回事。
 */
export function describeMergeGroup(group) {
  const parts = group.drop.map((d) => `${d.name}（${d.count} 篇）`).join('、')
  return `${group.keeper.name} ← ${parts}`
}
