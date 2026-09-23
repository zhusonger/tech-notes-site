/**
 * 仪表盘（画布 13:87）。
 *
 * 所有数字都来自 `/api/admin/dashboard` 的真实统计，没有一条写死：
 * - 已发布 / 草稿 / 总阅读量 来自 `posts`；
 * - 独立访客与阅读趋势 来自 `page_views`（服务端在响应文档请求时按「访客+天」去重记录）；
 * - 内容分布 来自 `posts.category` 分组；
 * - 待办 由内容状态派生（没有独立的待办表）。
 *
 * 因此**新部署的站点趋势图是平的、访客是 0** —— 那是真实值，不是渲染缺陷。
 */
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ApiError, adminApi, type DashboardData } from '../adminApi'
import { adminDashboardCopy as copy } from '../../data/admin'
import { DocIcon } from '../AdminIcons'
import { AdminCard, Badge, CardHead, Notice, PostStatusBadge } from '../ui'

export default function AdminDashboard() {
  const [range, setRange] = useState(30)
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (next: number) => {
    setLoading(true)
    setError(null)
    try {
      setData(await adminApi.dashboard(next))
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '加载仪表盘失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load(range)
  }, [load, range])

  if (error) {
    return (
      <div className="flex flex-col gap-[20px]">
        <Header range={range} onRange={setRange} updatedAt={null} />
        <Notice tone="error">{error}</Notice>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-[20px]">
      <Header range={range} onRange={setRange} updatedAt={data?.updatedAt ?? null} />

      {!data || loading ? <DashboardSkeleton /> : <DashboardBody data={data} />}
    </div>
  )
}

/* ------------------------------------------------------------------ 页头 */
function Header({
  range,
  onRange,
  updatedAt,
}: {
  range: number
  onRange: (n: number) => void
  updatedAt: string | null
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-[16px]">
      <div className="flex flex-col gap-[6px]">
        <h1 className="font-cn text-[22px] font-semibold leading-none text-[var(--color-ink)]">
          {copy.pageTitle}
        </h1>
        <p className="font-cn text-[12.5px] leading-none text-[var(--color-ink-3)]">
          {copy.pageSubtitle.replace('{time}', updatedAt ?? '—')}
        </p>
      </div>
      <div className="flex items-center gap-[4px] rounded-[10px] border border-[var(--color-line)] bg-[var(--admin-soft)] p-[3px]">
        {copy.ranges.map((item) => {
          const on = Number(item.key) === range
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => onRange(Number(item.key))}
              aria-pressed={on}
              className={[
                'h-[28px] rounded-[7px] px-[13px] font-cn text-[12.5px] transition-colors',
                on
                  ? 'bg-[var(--admin-surface)] font-medium text-[var(--color-ink)] shadow-[0_1px_2px_rgba(26,23,20,0.08)]'
                  : 'text-[var(--color-ink-3)] hover:text-[var(--color-ink-2)]',
              ].join(' ')}
            >
              {item.label}
            </button>
          )
        })}
      </div>
    </header>
  )
}

/* ------------------------------------------------------------------ 主体 */
function DashboardBody({ data }: { data: DashboardData }) {
  return (
    <div className="flex flex-col gap-[16px]">
      <KpiStrip data={data} />

      <div className="grid grid-cols-1 gap-[16px] xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <TrendCard data={data} />
        <DistributionCard data={data} />
      </div>

      <div className="grid grid-cols-1 gap-[16px] xl:grid-cols-2">
        <RecentEditsCard data={data} />
        <TodosCard data={data} />
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ KPI 条 */
function KpiStrip({ data }: { data: DashboardData }) {
  const { kpis } = data
  const items = [
    { key: 'published', label: copy.kpi.published, value: String(kpis.published.value), note: kpis.published.delta },
    { key: 'views', label: copy.kpi.views, value: kpis.views.value.toLocaleString('zh-CN'), note: '' },
    { key: 'drafts', label: copy.kpi.drafts, value: String(kpis.drafts.value), note: '', unit: copy.kpi.draftUnit },
    { key: 'visitors', label: copy.kpi.visitors, value: kpis.visitors.value.toLocaleString('zh-CN'), note: kpis.visitors.deltaText },
  ]

  return (
    <AdminCard className="grid grid-cols-4 divide-x divide-[var(--color-line)]">
      {items.map((item) => (
        <div key={item.key} className="flex flex-col gap-[13px] px-[24px] py-[22px]">
          <span className="font-cn text-[12px] font-medium leading-none text-[var(--color-ink-3)]">
            {item.label}
          </span>
          <div className="flex flex-wrap items-end gap-[8px]">
            <span className="font-latin text-[27px] font-bold leading-none text-[var(--color-ink)]">
              {item.value}
            </span>
            {item.unit ? (
              <span className="pb-[2px] font-cn text-[12.5px] leading-none text-[var(--color-ink-3)]">
                {item.unit}
              </span>
            ) : null}
            {item.note ? (
              <span className="mb-[2px] inline-flex items-center rounded-full bg-[var(--admin-soft-strong)] px-[8px] py-[3px] font-cn text-[11px] font-medium leading-none text-[var(--color-ink-2)]">
                {item.note}
              </span>
            ) : null}
          </div>
        </div>
      ))}
    </AdminCard>
  )
}

/* ------------------------------------------------------------------ 趋势 */
function TrendCard({ data }: { data: DashboardData }) {
  const values = data.trend.map((p) => p.value)
  const max = Math.max(...values, 1)
  const hasData = values.some((v) => v > 0)
  const n = values.length

  // 归一化到 0..100 的绘制空间，配合 preserveAspectRatio="none" 让图自适应宽度；
  // 描边用 non-scaling-stroke，避免纵向拉伸把线拉粗。
  const pad = 6
  const toPoint = (v: number, i: number) => {
    const x = n <= 1 ? 0 : (i / (n - 1)) * 100
    const y = 100 - pad - (v / max) * (100 - pad * 2)
    return [x, y] as const
  }
  const line = values.map((v, i) => toPoint(v, i).join(',')).join(' ')
  const area = `0,100 ${line} 100,100`

  const xTicks = [0, Math.floor((n - 1) / 4), Math.floor((n - 1) / 2), Math.floor(((n - 1) * 3) / 4), n - 1]
  const yTicks = [max, Math.round((max * 2) / 3), Math.round(max / 3), 0]

  return (
    <AdminCard>
      <CardHead
        title={copy.trend.title}
        right={<Badge tone="muted">{copy.trend.meta.replace('{n}', String(data.range))}</Badge>}
      />
      {!hasData ? (
        <div className="flex h-[224px] flex-col items-center justify-center gap-[8px] px-[24px]">
          <p className="font-cn text-[12.5px] text-[var(--color-ink-3)]">{copy.trend.empty}</p>
          <p className="font-cn text-[11px] text-[var(--color-ink-3)] opacity-80">
            访问统计从服务端本次部署开始累积
          </p>
        </div>
      ) : (
        <div className="flex gap-[12px] px-[24px] pt-[8px] pb-[20px]">
          <div className="flex w-[34px] shrink-0 flex-col justify-between py-[2px] text-right">
            {yTicks.map((t) => (
              <span key={t} className="font-latin text-[10px] leading-none text-[var(--color-ink-3)]">
                {t}
              </span>
            ))}
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-[10px]">
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-[176px] w-full overflow-visible">
              <defs>
                <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-primary)" stopOpacity="0.18" />
                  <stop offset="100%" stopColor="var(--color-primary)" stopOpacity="0" />
                </linearGradient>
              </defs>
              {[pad, 100 - pad].map((y) => (
                <line
                  key={y}
                  x1="0"
                  y1={y}
                  x2="100"
                  y2={y}
                  stroke="var(--color-line)"
                  strokeWidth="0.5"
                  vectorEffect="non-scaling-stroke"
                />
              ))}
              <polygon points={area} fill="url(#trendFill)" />
              <polyline
                points={line}
                fill="none"
                stroke="var(--color-primary)"
                strokeWidth="1.6"
                strokeLinejoin="round"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
            <div className="flex justify-between">
              {xTicks.map((i) => (
                <span key={i} className="font-latin text-[10px] leading-none text-[var(--color-ink-3)]">
                  {data.trend[i]?.day ?? ''}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </AdminCard>
  )
}

/* ------------------------------------------------------------------ 内容分布 */
function DistributionCard({ data }: { data: DashboardData }) {
  const { distribution } = data
  const max = Math.max(...distribution.rows.map((r) => r.count), 1)

  return (
    <AdminCard>
      <CardHead
        title={copy.distribution.title}
        right={
          <span className="font-cn text-[11.5px] text-[var(--color-ink-3)]">
            {copy.distribution.meta.replace('{n}', String(distribution.total))}
          </span>
        }
      />
      {distribution.rows.length === 0 ? (
        <p className="px-[24px] py-[32px] text-center font-cn text-[12.5px] text-[var(--color-ink-3)]">
          {copy.distribution.empty}
        </p>
      ) : (
        <ul className="flex flex-col gap-[15px] px-[24px] py-[20px]">
          {distribution.rows.map((row) => (
            <li key={row.name} className="flex flex-col gap-[8px]">
              <div className="flex items-center justify-between gap-[10px]">
                <span className="truncate font-cn text-[12.5px] font-medium text-[var(--color-ink)]">
                  {row.name}
                </span>
                <span className="shrink-0 font-cn text-[11.5px] text-[var(--color-ink-3)]">
                  {row.count} 篇
                </span>
              </div>
              <div className="h-[6px] overflow-hidden rounded-full bg-[var(--admin-soft-strong)]">
                <div
                  className="h-full rounded-full bg-[var(--color-primary)]"
                  style={{ width: `${Math.max((row.count / max) * 100, 3)}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </AdminCard>
  )
}

/* ------------------------------------------------------------------ 最近编辑 */
function RecentEditsCard({ data }: { data: DashboardData }) {
  return (
    <AdminCard>
      <CardHead
        title={copy.recent.title}
        right={
          <Link
            to="/admin/posts"
            className="font-cn text-[11.5px] font-medium text-[var(--color-primary)] hover:opacity-80"
          >
            {copy.recent.link}
          </Link>
        }
      />
      {data.recentEdits.length === 0 ? (
        <p className="px-[24px] py-[32px] text-center font-cn text-[12.5px] text-[var(--color-ink-3)]">
          {copy.recent.empty}
        </p>
      ) : (
        <ul className="divide-y divide-[var(--color-line)]">
          {data.recentEdits.map((row) => (
            <li key={row.id} className="flex items-center gap-[13px] px-[24px] py-[13px]">
              <span className="inline-flex h-[32px] w-[32px] shrink-0 items-center justify-center rounded-[9px] bg-[var(--color-primary-soft)] text-[var(--color-primary)]">
                <DocIcon className="h-[16px] w-[16px]" />
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-[4px]">
                <span className="truncate font-cn text-[13.5px] font-medium text-[var(--color-ink)]">
                  {row.title}
                </span>
                <span className="truncate font-cn text-[11.5px] text-[var(--color-ink-3)]">
                  {row.category || '未分类'} · {relativeTime(row.updatedAt)}
                </span>
              </span>
              <PostStatusBadge status={row.status} labels={copy.status} />
            </li>
          ))}
        </ul>
      )}
    </AdminCard>
  )
}

/* ------------------------------------------------------------------ 待办 */
function TodosCard({ data }: { data: DashboardData }) {
  const ratio = data.weekly.target > 0 ? Math.min(data.weekly.done / data.weekly.target, 1) : 0

  return (
    <AdminCard className="flex flex-col">
      <CardHead
        title={copy.todos.title}
        right={
          data.todos.length > 0 ? (
            <span className="inline-flex h-[20px] min-w-[20px] items-center justify-center rounded-full bg-[var(--color-primary-soft)] px-[6px] font-latin text-[11px] font-semibold text-[var(--color-primary)]">
              {data.todos.length}
            </span>
          ) : null
        }
      />
      {data.todos.length === 0 ? (
        <p className="px-[24px] py-[32px] text-center font-cn text-[12.5px] text-[var(--color-ink-3)]">
          {copy.todos.empty}
        </p>
      ) : (
        <ul className="divide-y divide-[var(--color-line)]">
          {data.todos.map((todo) => (
            <li key={todo.title} className="flex items-center gap-[13px] px-[24px] py-[13px]">
              <span className="h-[17px] w-[17px] shrink-0 rounded-[5px] border border-[var(--color-line)] bg-[var(--admin-soft)]" />
              <span className="flex min-w-0 flex-col gap-[4px]">
                <span className="truncate font-cn text-[12.5px] text-[var(--color-ink)]">{todo.title}</span>
                <span className="font-cn text-[11px] text-[var(--color-ink-3)]">{todo.meta}</span>
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="flex-1" />
      <div className="border-t border-[var(--color-line)] px-[24px] py-[16px]">
        <div className="flex items-center justify-between pb-[9px]">
          <span className="font-cn text-[11.5px] text-[var(--color-ink-3)]">{copy.weekly.label}</span>
          <span className="font-latin text-[11.5px] font-semibold text-[var(--color-ink)]">
            {copy.weekly.value.replace('{done}', String(data.weekly.done)).replace('{target}', String(data.weekly.target))}
          </span>
        </div>
        <div className="h-[5px] overflow-hidden rounded-full bg-[var(--admin-soft-strong)]">
          <div className="h-full rounded-full bg-[var(--color-primary)]" style={{ width: `${ratio * 100}%` }} />
        </div>
      </div>
    </AdminCard>
  )
}

/* ------------------------------------------------------------------ 骨架 */
function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-[16px]" aria-busy="true" aria-label="加载中">
      <AdminCard className="h-[118px] animate-pulse bg-[var(--admin-soft)]" />
      <div className="grid grid-cols-1 gap-[16px] xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <AdminCard className="h-[286px] animate-pulse bg-[var(--admin-soft)]" />
        <AdminCard className="h-[286px] animate-pulse bg-[var(--admin-soft)]" />
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ 相对时间 */
/** 入参是服务端格式化好的本地时间；只有当天/昨天才换成相对说法，其余原样显示。 */
function relativeTime(formatted: string) {
  const match = formatted.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/)
  if (!match) return formatted
  const [, y, m, d, hh, mm] = match
  const then = new Date(Number(y), Number(m) - 1, Number(d), Number(hh), Number(mm))
  const now = new Date()
  const dayOf = (x: Date) => Math.floor(new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime() / 86400000)
  const diff = dayOf(now) - dayOf(then)
  if (diff === 0) return `今天 ${hh}:${mm}`
  if (diff === 1) return `昨天 ${hh}:${mm}`
  if (diff < 7) return `${diff} 天前`
  return formatted
}
