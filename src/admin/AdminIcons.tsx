/**
 * 后台专用图标。
 *
 * 与展示站的 `components/Icons.tsx` 分开：这批只在后台使用，混进公共图标集会
 * 让前台多打包一堆用不到的路径。统一 24 视窗、currentColor 描边，与画布图标口径一致。
 */
import type { SVGProps } from 'react'

/**
 * 后台图标集的统一入口。
 * 展示站已有的通用图标（对勾 / 右箭头 / 品牌标 / 搜索）直接从此处转出，
 * 这样后台各处只认 `./AdminIcons` 一个来源，不必记两套路径。
 */
export { CheckIcon, ChevronRightIcon, LogoMark, SearchIcon } from '../components/Icons'

type IconProps = SVGProps<SVGSVGElement>

const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

const Svg = ({ children, ...props }: IconProps) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...stroke} {...props}>
    {children}
  </svg>
)

/* --------------------------------------------------------------- 侧边栏导航 */
export const GaugeIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3.5" y="3.5" width="7" height="7" rx="1.8" />
    <rect x="13.5" y="3.5" width="7" height="4.5" rx="1.8" />
    <rect x="13.5" y="11" width="7" height="9.5" rx="1.8" />
    <rect x="3.5" y="13.5" width="7" height="7" rx="1.8" />
  </Svg>
)

export const DocIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 3.5h7.5L19 9v11.5H6z" />
    <path d="M13.5 3.5V9H19" />
    <path d="M9 13h6M9 16.5h4" />
  </Svg>
)

export const BoxIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3.5 20 7.5v9L12 20.5 4 16.5v-9z" />
    <path d="M4 7.5 12 11.5 20 7.5M12 11.5v9" />
  </Svg>
)

export const IdCardIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="5" width="18" height="14" rx="2.4" />
    <circle cx="9" cy="11" r="2.2" />
    <path d="M14.5 10h4M14.5 13h4M6.5 15.6c.8-1.2 4.2-1.2 5 0" />
  </Svg>
)

export const ImageIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3.5" y="4.5" width="17" height="15" rx="2.4" />
    <circle cx="9" cy="10" r="1.6" />
    <path d="m4.5 17 4.8-4.2 4 3.2 2.6-2.2L20 17.5" />
  </Svg>
)

export const LayoutIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3.5" y="4.5" width="17" height="15" rx="2.4" />
    <path d="M3.5 9.5h17M9.5 9.5v10" />
  </Svg>
)

export const TagIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12.6 3.6H20v7.4l-8.6 8.6a1.6 1.6 0 0 1-2.3 0l-5.1-5.1a1.6 1.6 0 0 1 0-2.3z" />
    <circle cx="16.4" cy="7.4" r="1.5" />
  </Svg>
)

export const SlidersIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 7h16M4 12h16M4 17h16" />
    <circle cx="9" cy="7" r="2" />
    <circle cx="15" cy="12" r="2" />
    <circle cx="7.5" cy="17" r="2" />
  </Svg>
)

export const HistoryIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3.6 12a8.4 8.4 0 1 0 2.6-6.1" />
    <path d="M3.5 4.5V9H8" />
    <path d="M12 8v4.4l3 1.8" />
  </Svg>
)

/**
 * 访客记录。人物 + 两行记录 —— 既与「仪表盘」的盘面区分开，
 * 也没用 EyeIcon：那个已经表示「显示 / 隐藏密码」，同形不同义会误导。
 */
export const VisitorsIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="9.4" cy="7.8" r="3.2" />
    <path d="M3.6 19.4c0-3.2 2.6-5.3 5.8-5.3s5.8 2.1 5.8 5.3" />
    <path d="M17.4 7.4h3.2M17.4 12h3.2" />
  </Svg>
)

/* ------------------------------------------------------------------- 通用 */
export const ChevronDownIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="m6 9.5 6 6 6-6" />
  </Svg>
)

export const PlusIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 5.5v13M5.5 12h13" />
  </Svg>
)

export const LogoutIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M14.5 4.5H6.5A2 2 0 0 0 4.5 6.5v11a2 2 0 0 0 2 2h8" />
    <path d="M14 12h6.5M17.5 8.8 20.7 12l-3.2 3.2" />
  </Svg>
)

export const LockIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="4.5" y="10.5" width="15" height="9.5" rx="2.2" />
    <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
  </Svg>
)

export const ShieldIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3.5 19 6v6c0 4.2-2.8 7.3-7 8.5-4.2-1.2-7-4.3-7-8.5V6z" />
    <path d="m9 12 2.2 2.2L15.4 10" />
  </Svg>
)

export const EyeIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M2.8 12S6.4 6.5 12 6.5 21.2 12 21.2 12 17.6 17.5 12 17.5 2.8 12 2.8 12" />
    <circle cx="12" cy="12" r="2.8" />
  </Svg>
)

export const EyeOffIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 4.5 20 20.5" />
    <path d="M9.6 6.9A8.9 8.9 0 0 1 12 6.5c5.6 0 9.2 5.5 9.2 5.5a15 15 0 0 1-3.1 3.5" />
    <path d="M6.3 8.6A15.4 15.4 0 0 0 2.8 12S6.4 17.5 12 17.5a9 9 0 0 0 3.3-.6" />
  </Svg>
)

export const CopyIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="9" y="9" width="11" height="11" rx="2.2" />
    <path d="M15 5.6A2.1 2.1 0 0 0 12.9 3.5H5.6A2.1 2.1 0 0 0 3.5 5.6v7.3A2.1 2.1 0 0 0 5.6 15" />
  </Svg>
)

export const RefreshIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M20 11.5a8 8 0 1 0-2.4 5.7" />
    <path d="M20.4 5.8v5.7h-5.7" />
  </Svg>
)

export const MonitorIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="4.5" width="18" height="12" rx="2.2" />
    <path d="M9 20h6M12 16.5V20" />
  </Svg>
)

export const AlertIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 4.5 21 19.5H3z" />
    <path d="M12 10v4M12 16.6v.1" />
  </Svg>
)

export const KeyIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="8" cy="12" r="3.6" />
    <path d="M11.6 12H20M17 12v3M14 12v2.4" />
  </Svg>
)

export const XIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6.5 6.5 17.5 17.5M17.5 6.5 6.5 17.5" />
  </Svg>
)

/** 保留策略 / 时间范围一类的「时间」语义 */
export const ClockIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 1.8" />
  </Svg>
)

/** 打开外部站点（查看站点 / 预览前台） */
export const ExternalIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M13.5 5.5H18.5V10.5" />
    <path d="M18.5 5.5 11 13" />
    <path d="M17 14.5v3a2 2 0 0 1-2 2H6.5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h3" />
  </Svg>
)

/** 顺序调整（上移 / 下移），用于「拖动排序」的无障碍替代 */
export const ArrowUpIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 18.5v-13M6 11.5 12 5.5l6 6" />
  </Svg>
)

export const ArrowDownIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 5.5v13M6 12.5l6 6 6-6" />
  </Svg>
)

/* --------------------------------------------------------- 内容列表与分页 */

/**
 * 拖拽把手（六点）。画布上项目卡片右上角那枚就是它。
 *
 * 把手是**真能拖的**：项目卡片墙的排序靠它，不是装饰。
 * 键盘用户另有行菜单里的上移/下移作为替代路径（见 AdminProjects）。
 */
export const DragHandleIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="9" cy="6.5" r="1.15" fill="currentColor" stroke="none" />
    <circle cx="15" cy="6.5" r="1.15" fill="currentColor" stroke="none" />
    <circle cx="9" cy="12" r="1.15" fill="currentColor" stroke="none" />
    <circle cx="15" cy="12" r="1.15" fill="currentColor" stroke="none" />
    <circle cx="9" cy="17.5" r="1.15" fill="currentColor" stroke="none" />
    <circle cx="15" cy="17.5" r="1.15" fill="currentColor" stroke="none" />
  </Svg>
)

/** 精选（首页推荐位）。复用文章列表里那枚星形，两处的「推荐」含义一致。 */
export const StarIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 4.6l2.3 4.7 5.2.7-3.8 3.6.9 5.1L12 16.3l-4.6 2.4.9-5.1-3.8-3.6 5.2-.7z" />
  </Svg>
)

export const MoreIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="5.5" cy="12" r="1.4" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
    <circle cx="18.5" cy="12" r="1.4" fill="currentColor" stroke="none" />
  </Svg>
)

export const PencilIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M16.2 4.6a1.9 1.9 0 0 1 2.7 2.7L9.4 16.8l-3.6.9.9-3.6z" />
  </Svg>
)

export const TrashIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5.5 7.2h13M10 7.2V5.5h4v1.7M7 7.2l.8 11a1 1 0 0 0 1 .9h6.4a1 1 0 0 0 1-.9l.8-11M10.4 10.6v5M13.6 10.6v5" />
  </Svg>
)

export const UndoIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8.6 8.2H14a4.4 4.4 0 0 1 0 8.8h-3M8.6 8.2l2.6-2.6M8.6 8.2l2.6 2.6" />
  </Svg>
)

export const ArrowLeftIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M14.5 6.5 9 12l5.5 5.5" />
  </Svg>
)

export const ArrowRightIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9.5 6.5 15 12l-5.5 5.5" />
  </Svg>
)

/* --------------------------------------------------------- 正文编辑器工具条 */
/*
 * 工具条图标画成「字形」而不是通用形状（粗体是 B、斜体是 I、标题是 H）：
 * 这三枚按钮的语义就是字形本身，换成加粗方块之类的抽象图形反而要多看一眼才认得出。
 * 描边口径与其余图标一致，因此视觉上仍属同一套。
 */
export const BoldIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M7.5 4.8h4.9a3.5 3.5 0 0 1 .4 7H7.5z" />
    <path d="M7.5 11.8h5.6a3.7 3.7 0 0 1 0 7.4H7.5z" />
  </Svg>
)

export const ItalicIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M10.6 4.8h5.6M7.8 19.2h5.6M14.2 4.8 9.8 19.2" />
  </Svg>
)

export const HeadingIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 4.8v14.4M18 4.8v14.4M6 12h12" />
  </Svg>
)

export const LinkIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9.6 14.4 14.4 9.6" />
    <path d="M12.4 7.6l1.5-1.5a3.3 3.3 0 0 1 4.6 4.6l-1.5 1.5" />
    <path d="M11.6 16.4l-1.5 1.5a3.3 3.3 0 0 1-4.6-4.6l1.5-1.5" />
  </Svg>
)

/** 引用：左侧竖线 + 两条缩进行，与「列表」的三行三点刻意区分开。 */
export const QuoteIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5.6 6.4v11.2" />
    <path d="M10.2 9.4h8.2M10.2 14.6h6" />
  </Svg>
)

export const CodeIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="m9.2 8.4-3.6 3.6 3.6 3.6M14.8 8.4l3.6 3.6-3.6 3.6" />
  </Svg>
)

export const ListIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9.6 6.6h8.8M9.6 12h8.8M9.6 17.4h8.8" />
    <circle cx="5.6" cy="6.6" r="1.1" fill="currentColor" stroke="none" />
    <circle cx="5.6" cy="12" r="1.1" fill="currentColor" stroke="none" />
    <circle cx="5.6" cy="17.4" r="1.1" fill="currentColor" stroke="none" />
  </Svg>
)

/** 保存：软盘已被淘汰但「保存」的语义仍靠它一眼识别，故保留这个形状。 */
export const SaveIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5.5 4.5h9.2l4.8 4.8v10.2H5.5z" />
    <path d="M9 4.5v5h5.4v-5M8.6 19.5v-5h6.8v5" />
  </Svg>
)
