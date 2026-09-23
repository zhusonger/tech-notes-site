/**
 * 访客记录。
 *
 * 与仪表盘的「独立访客」是两个数据源：仪表盘读的是匿名哈希的计数，
 * 这里读的是落明文的 visitor_logs（原始 IP + UA），所以能给出地区与设备。
 * 地区与设备都由服务端解析好（`region` / `device` 里的 `label` 可直接上屏），
 * 前端只负责排版 —— 解析规则住在 server/geo.mjs 与 server/ua.mjs，不该在前端复述一遍。
 *
 * 这里用页码分页而不是「加载更多」（操作日志用的是后者）：访客列表是一份**有边界**的名单，
 * 用户会带着「上个月杭州来的那个是谁」这类问题来回翻，页码比一路往下滚更好用。
 */
import { useCallback, useEffect, useState } from 'react'
import { adminVisitorsCopy as copy } from '../../data/admin'
import { ApiError, adminApi, type VisitorResponse, type VisitorRow } from '../adminApi'
import {
  Chip,
  Col,
  EmptyState,
  Notice,
  PageHeader,
  Pager,
  SkeletonRows,
  TextInput,
  Th,
  Toolbar,
} from '../ui'

const PER_PAGE = 20

const EMPTY: VisitorResponse = {
  items: [],
  total: 0,
  views: 0,
  page: 1,
  perPage: PER_PAGE,
  totalPages: 1,
  range: 7,
  keyword: '',
  retentionDays: 30,
  geoReady: true,
  geoState: 'ready',
}

export default function AdminVisitors() {
  const [range, setRange] = useState(7)
  /** 输入框里的原文 */
  const [input, setInput] = useState('')
  /** 真正参与查询的关键词，由 input 防抖派生 —— 每敲一个字符就查一次会把请求打满 */
  const [keyword, setKeyword] = useState('')

  const [data, setData] = useState<VisitorResponse>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const timer = setTimeout(() => setKeyword(input.trim()), 350)
    return () => clearTimeout(timer)
  }, [input])

  const load = useCallback(
    async (targetPage: number, signal?: { cancelled: boolean }) => {
      setLoading(true)
      setError('')
      try {
        const res = await adminApi.visitors({
          range,
          keyword: keyword || undefined,
          page: targetPage,
          perPage: PER_PAGE,
        })
        if (signal?.cancelled) return
        setData(res)
      } catch (err) {
        if (signal?.cancelled) return
        setError(err instanceof ApiError ? err.message : copy.error)
      } finally {
        if (!signal?.cancelled) setLoading(false)
      }
    },
    [range, keyword]
  )

  /*
   * 筛选条件一变就回到第一页重查。
   * 依赖是 `load`（由 range / keyword 决定）而不是页码本身 ——
   * 否则点「下一页」推进页码时会再触发一次重置，用户刚翻过去就被弹回第一页。
   */
  useEffect(() => {
    const signal = { cancelled: false }
    void load(1, signal)
    return () => {
      signal.cancelled = true
    }
  }, [load])

  const hasFilter = keyword !== ''

  return (
    <div className="flex min-h-full flex-col gap-[18px]">
      <PageHeader title={copy.title} subtitle={copy.subtitle} />

      <Toolbar
        left={
          <div className="flex items-center gap-[8px]">
            {copy.ranges.map((r) => (
              <Chip key={r.key} active={Number(r.key) === range} onClick={() => setRange(Number(r.key))}>
                {r.label}
              </Chip>
            ))}
          </div>
        }
        right={
          <div className="w-[196px]">
            <TextInput
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={copy.searchPlaceholder}
              aria-label={copy.searchPlaceholder}
            />
          </div>
        }
      />

      {error ? (
        <Notice tone="error">
          {error}
          <button type="button" onClick={() => void load(data.page)} className="ml-[8px] underline">
            {copy.retry}
          </button>
        </Notice>
      ) : null}

      <section className="flex min-h-[320px] flex-1 flex-col rounded-[16px] border border-[var(--color-line)] bg-[var(--admin-surface)]">
        <div className="flex items-center gap-[12px] bg-[var(--admin-readonly)] px-[20px] py-[12px]">
          <Col width={150}>
            <Th>{copy.columns.ip}</Th>
          </Col>
          <Col grow>
            <Th>{copy.columns.region}</Th>
          </Col>
          <Col width={160}>
            <Th>{copy.columns.device}</Th>
          </Col>
          <Col width={64} right>
            <Th>{copy.columns.views}</Th>
          </Col>
          <Col width={118}>
            <Th>{copy.columns.first}</Th>
          </Col>
          <Col width={118}>
            <Th>{copy.columns.last}</Th>
          </Col>
        </div>

        <div className="flex flex-1 flex-col">
          {loading ? (
            <SkeletonRows rows={8} height={46} />
          ) : data.items.length === 0 ? (
            <EmptyState title={hasFilter ? copy.emptyFiltered : copy.empty} />
          ) : (
            data.items.map((row, i) => <VisitorLine key={row.ip} row={row} first={i === 0} />)
          )}
        </div>

        <span className="h-px w-full bg-[var(--color-line)]" aria-hidden="true" />
        <div className="flex flex-wrap items-center justify-between gap-[12px] px-[20px] py-[14px]">
          <span className="font-cn text-[11px] text-[var(--color-ink-3)]">
            {copy.footer.policy.replace('{days}', String(data.retentionDays))}
            {' · '}
            {copy.footer.summary
              .replace('{total}', String(data.total))
              .replace('{views}', String(data.views))}
          </span>

          <Pager
            page={data.page}
            totalPages={data.totalPages}
            disabled={loading}
            onChange={(next) => void load(next)}
          />
        </div>
      </section>
    </div>
  )
}

/* ------------------------------------------------------------------ 行 */
function VisitorLine({ row, first }: { row: VisitorRow; first: boolean }) {
  const region = row.region
  const isBot = row.device.kind === 'bot'

  return (
    <div
      className={[
        'flex items-center gap-[12px] px-[20px] py-[14px] transition-colors hover:bg-[var(--color-bg-soft)]',
        first ? '' : 'border-t border-[var(--color-line-soft)]',
      ].join(' ')}
    >
      <Col width={150} className="font-latin text-[12px] text-[var(--color-ink)]">
        <span className="block truncate" title={row.ip}>
          {row.ip}
        </span>
      </Col>

      <Col grow>
        {!region ? (
          <span className="font-cn text-[12px] text-[var(--color-ink-3)]">{copy.unknown}</span>
        ) : region.private ? (
          <span className="font-cn text-[12px] text-[var(--color-ink-3)]">{copy.privateLabel}</span>
        ) : (
          // 省市上屏，运营商与国家放 title：表格里塞不下，但排查「这个 IP 是谁」时用得上
          <span
            className="block truncate font-cn text-[12px] text-[var(--color-ink-2)]"
            title={[region.country, region.province, region.city, region.isp].filter(Boolean).join(' · ')}
          >
            {region.label}
          </span>
        )}
      </Col>

      <Col width={160}>
        <span
          className={[
            'block truncate font-cn text-[12px]',
            isBot ? 'text-[var(--color-ink-3)]' : 'text-[var(--color-ink-2)]',
          ].join(' ')}
          title={row.device.label}
        >
          {row.device.label}
        </span>
      </Col>

      <Col width={64} right className="font-latin text-[12px] text-[var(--color-ink-2)]">
        {row.views}
      </Col>

      <Col width={118} className="font-latin text-[11.5px] text-[var(--color-ink-3)]">
        {row.firstLabel}
      </Col>

      <Col width={118} className="font-latin text-[11.5px] text-[var(--color-ink-3)]">
        {row.lastLabel}
      </Col>
    </div>
  )
}
