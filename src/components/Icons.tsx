import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement>

const strokeDefaults = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

/** 站点标记：叶片包裹的坐标点，呼应「把复杂的事做简单」 */
export function LogoMark(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <rect x="2" y="2" width="20" height="20" rx="6" className="fill-[var(--color-primary)]" />
      <path
        d="M8 15.5c0-4 3-7 7.5-7.5 0 4.2-2.4 7.2-6.2 7.5"
        className="stroke-white"
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <circle cx="8.6" cy="16.2" r="1.4" className="fill-white" />
    </svg>
  )
}

export function SearchIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...strokeDefaults} {...props}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4 4" />
    </svg>
  )
}

export function ArrowRightIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...strokeDefaults} {...props}>
      <path d="M4 12h16M14 6l6 6-6 6" />
    </svg>
  )
}

export function ArrowUpRightIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...strokeDefaults} {...props}>
      <path d="M7 17 17 7M8 7h9v9" />
    </svg>
  )
}

export function ChevronRightIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...strokeDefaults} {...props}>
      <path d="m9 5 7 7-7 7" />
    </svg>
  )
}

export function PinIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...strokeDefaults} {...props}>
      <path d="M12 21s6.5-5.6 6.5-10.4A6.5 6.5 0 0 0 5.5 10.6C5.5 15.4 12 21 12 21Z" />
      <circle cx="12" cy="10.4" r="2.4" />
    </svg>
  )
}

export function MailIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...strokeDefaults} {...props}>
      <rect x="3" y="5.5" width="18" height="13" rx="2.5" />
      <path d="m3.8 7 8.2 6 8.2-6" />
    </svg>
  )
}

export function GithubIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...strokeDefaults} {...props}>
      <path d="M15 21v-3.2c0-.9-.3-1.5-.9-2 2.9-.3 5.9-1.4 5.9-6.4a5 5 0 0 0-1.4-3.5 4.6 4.6 0 0 0-.1-3.4s-1.2-.4-3.9 1.4a13.6 13.6 0 0 0-7.2 0C4.7 2.1 3.5 2.5 3.5 2.5a4.6 4.6 0 0 0-.1 3.4A5 5 0 0 0 2 9.4c0 5 3 6.1 5.9 6.4-.6.5-.9 1.1-.9 2V21" />
      <path d="M9 17.5c-2.5.8-4.5 0-5.5-1.5" />
    </svg>
  )
}

export function StarIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...strokeDefaults} {...props}>
      <path d="m12 3.6 2.6 5.4 5.9.8-4.3 4.1 1 5.9-5.2-2.8-5.2 2.8 1-5.9L3.5 9.8l5.9-.8Z" />
    </svg>
  )
}

export function ForkIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...strokeDefaults} {...props}>
      <circle cx="6.5" cy="5.5" r="2.5" />
      <circle cx="17.5" cy="5.5" r="2.5" />
      <circle cx="12" cy="18.5" r="2.5" />
      <path d="M6.5 8v1.5a4 4 0 0 0 4 4h3a4 4 0 0 0 4-4V8M12 13.5V16" />
    </svg>
  )
}

export function DownloadIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...strokeDefaults} {...props}>
      <path d="M12 3.5v11M7.5 10 12 14.5 16.5 10M4.5 19.5h15" />
    </svg>
  )
}

export function PrinterIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...strokeDefaults} {...props}>
      <path d="M7 9V4h10v5M7 18H5.5A1.5 1.5 0 0 1 4 16.5v-5A1.5 1.5 0 0 1 5.5 10h13a1.5 1.5 0 0 1 1.5 1.5v5a1.5 1.5 0 0 1-1.5 1.5H17" />
      <rect x="7" y="14" width="10" height="6" rx="1.2" />
    </svg>
  )
}

export function SortIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...strokeDefaults} {...props}>
      <path d="M7 5v14M3.8 15.8 7 19l3.2-3.2M17 19V5M13.8 8.2 17 5l3.2 3.2" />
    </svg>
  )
}

export function BookIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...strokeDefaults} {...props}>
      <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H10a2 2 0 0 1 2 2v13a1.6 1.6 0 0 0-1.6-1.6H4Z" />
      <path d="M20 5.5A1.5 1.5 0 0 0 18.5 4H14a2 2 0 0 0-2 2v13a1.6 1.6 0 0 1 1.6-1.6H20Z" />
    </svg>
  )
}

export function PhoneIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...strokeDefaults} {...props}>
      <rect x="6.5" y="3" width="11" height="18" rx="2.4" />
      <path d="M10.5 18h3" />
    </svg>
  )
}

export function LayersIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...strokeDefaults} {...props}>
      <path d="m12 3.5 8 4.2-8 4.2-8-4.2Z" />
      <path d="m4 12.4 8 4.2 8-4.2M4 16.6l8 4.2 8-4.2" />
    </svg>
  )
}

export function CodeIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...strokeDefaults} {...props}>
      <path d="m9 8-4 4 4 4M15 8l4 4-4 4" />
    </svg>
  )
}

/** 3D / 图形渲染：等距立方体，与 LayersIcon 同一套线框风格 */
export function CubeIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...strokeDefaults} {...props}>
      <path d="m12 3.6 7.4 4.2v8.4L12 20.4l-7.4-4.2V7.8Z" />
      <path d="M4.6 7.8 12 12l7.4-4.2M12 12v8.4" />
    </svg>
  )
}

/** 音视频：波形线，用于编解码与媒体处理 */
export function WaveIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...strokeDefaults} {...props}>
      <path d="M2.8 12h2.4l2-6.2 3 12.6 2.4-9.2 1.8 6.4 1.4-3.6h5.4" />
    </svg>
  )
}

export function ServerIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...strokeDefaults} {...props}>
      <rect x="3.5" y="4" width="17" height="6" rx="2" />
      <rect x="3.5" y="14" width="17" height="6" rx="2" />
      <path d="M7.5 7h.01M7.5 17h.01" />
    </svg>
  )
}

export function CheckIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...strokeDefaults} {...props}>
      <path d="m5 12.8 4.4 4.2L19 6.5" />
    </svg>
  )
}

export function ExternalIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...strokeDefaults} {...props}>
      <path d="M14 4h6v6M20 4l-9 9" />
      <path d="M18 14.5V19a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 19V7.5A1.5 1.5 0 0 1 5 6h4.6" />
    </svg>
  )
}

/** 技术栈卡片与项目卡片图标：按名称挑选，保证网格内图标风格一致 */
export function techIcon(name: string) {
  switch (name) {
    // 首页技术栈
    case 'Android':
    case 'Kotlin':
    case 'Flutter':
      return PhoneIcon
    case 'Java':
    case 'C / C++':
    case 'TypeScript':
      return CodeIcon
    case 'OpenGL ES':
    case 'Unity3D':
      return CubeIcon
    case 'FFmpeg':
    case 'MediaCodec':
      return WaveIcon
    case 'libpag':
      return LayersIcon
    // 项目卡片的语言标识
    case 'Shell':
    case 'Python':
      return ServerIcon
    default:
      return CodeIcon
  }
}
