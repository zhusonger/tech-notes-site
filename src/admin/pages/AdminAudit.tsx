/**
 * 操作日志。
 *
 * 服务端已经把动作码翻译成中文句式送来（`text`），前端**不做二次加工** ——
 * 翻译规则是服务端写的动作码决定的，放在前端等于把同一份知识维护两遍。
 * 唯一的前端职责是把「未登记的动作码」如实标出来，方便回头补目录。
 *
 * 翻页用「加载更多」而不是页码：日志是追加型的流水，从新到旧连续往下读
 * 比在页码之间跳更贴近实际用法（画布给的也是「加载更多」）。
 */
import { useCallback, useEffect, useState } from 'react'
import { adminAuditCopy as copy } from '../../data/admin'
import {
  ApiError,
  adminApi,
  type AuditLogResponse,
  type AuditLogRow,
  type AuditResult,
} from '../adminApi'
import { ClockIcon } from '../AdminIcons'
import {
  Button,
  Chip,
  ChipCount,
  Col,
  ControlSelect,
  EmptyState,
  HeaderButton,
  Modal,
  Notice,
  PageHeader,
  SkeletonRows,
  Th,
  Toolbar,
} from '../ui'

const PER_PAGE = 20

const EMPTY: AuditLogResponse = {
  items: [],
  counts: { all: 0, success: 0, failed: 0 },
  actors: [],
  range: 7,
  result: 'all',
  actor: '',
  total: 0,
  page: 1,
  perPage: PER_PAGE,
  totalPages: 1,
  retentionDays: 90,
  expired: 0,
}

export default function AdminAudit() {
  const [result, setResult] = useState<AuditResult>('all')
  const [range, setRange] = useState(7)
  const [actor, setActor] = useState('')
  const [page, setPage] = useState(1)

  const [data, setData] = useState<AuditLogResponse>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [policyOpen, setPolicyOpen] = useState(false)

  /** 只取第一页时整体替换；「加载更多」时追加。用 ref 传参，避免把 page 塞进依赖。 */
  const load = useCallback(
    async (targetPage: number, signal?: { cancelled: boolean }) => {
      if (targetPage === 1) setLoading(true)
      else setLoadingMore(true)
      setError('')
      try {
        const res = await adminApi.auditLogs({ result, range, actor: actor || undefined, page: targetPage, perPage: PER_PAGE })
        if (signal?.cancelled) return
        setData((prev) =>
          targetPage === 1 ? res : { ...res, items: [...prev.items, ...res.items] }
        )
      } catch (err) {
        if (signal?.cancelled) return
        setError(err instanceof ApiError ? err.message : copy.error)
      } finally {
        if (!signal?.cancelled) {
          setLoading(false)
          setLoadingMore(false)
        }
      }
    },
    [result, range, actor]
  )

  /*
   * 筛选条件一变就重查第一页。
   *
   * 依赖是 `load`（它由 result/range/actor 决定），不是 page —— 否则「加载更多」
   * 推进页码时会再触发一次「重置到第一页」的查询，用户点了加载更多却看到列表被换掉。
   * 「加载更多」自己直接调 load(next)，不经过这个副作用。
   */
  useEffect(() => {
    const signal = { cancelled: false }
    setPage(1)
    void load(1, signal)
    return () => {
      signal.cancelled = true
    }
  }, [load])

  const hasFilter = result !== 'all' || actor !== ''
  const canLoadMore = !loading && data.items.length < data.total

  return (
    <div className="flex min-h-full flex-col gap-[18px]">
      <PageHeader
        title={copy.title}
        subtitle={copy.subtitle}
        right={
          <HeaderButton icon={<ClockIcon className="h-[14px] w-[14px]" />} onClick={() => setPolicyOpen(true)}>
            {copy.retention.button}
          </HeaderButton>
        }
      />

      <Toolbar
        left={
          <div className="flex items-center gap-[8px]">
            {copy.results.map((r) => (
              <Chip
                key={r.key}
                active={r.key === result}
                onClick={() => setResult(r.key as AuditResult)}
              >
                {r.label} <ChipCount>{data.counts[r.key as AuditResult]}</ChipCount>
              </Chip>
            ))}
          </div>
        }
        right={
          <>
            <ControlSelect
              ariaLabel="按时间范围筛选"
              value={String(range)}
              onChange={(v) => setRange(Number(v))}
              options={copy.ranges.map((r) => ({ value: r.key, label: r.label }))}
            />
            <ControlSelect
              ariaLabel="按操作者筛选"
              value={actor}
              onChange={setActor}
              options={[
                { value: '', label: copy.allActors },
                ...data.actors.map((a) => ({ value: a.value, label: a.value })),
              ]}
            />
          </>
        }
      />

      {error ? (
        <Notice tone="error">
          {error}
          <button type="button" onClick={() => void load(1)} className="ml-[8px] underline">
            {copy.retry}
          </button>
        </Notice>
      ) : null}
      {notice ? (
        <Notice tone="success" onClose={() => setNotice('')}>
          {notice}
        </Notice>
      ) : null}

      <section className="flex min-h-[320px] flex-1 flex-col rounded-[16px] border border-[var(--color-line)] bg-[var(--admin-surface)]">
        <div className="flex items-center gap-[12px] bg-[var(--admin-readonly)] px-[20px] py-[12px]">
          <Col width={110}>
            <Th>{copy.columns.time}</Th>
          </Col>
          <Col grow>
            <Th>{copy.columns.actor}</Th>
          </Col>
          <Col width={130}>
            <Th>{copy.columns.ip}</Th>
          </Col>
          <Col grow>
            <Th>{copy.columns.text}</Th>
          </Col>
          <Col width={80}>
            <Th>{copy.columns.result}</Th>
          </Col>
        </div>

        <div className="flex flex-1 flex-col">
          {loading ? (
            <SkeletonRows rows={8} height={46} />
          ) : data.items.length === 0 ? (
            <EmptyState title={hasFilter ? copy.emptyFiltered : copy.empty} />
          ) : (
            data.items.map((row, i) => <LogRow key={row.id} row={row} first={i === 0} />)
          )}
        </div>

        <span className="h-px w-full bg-[var(--color-line)]" aria-hidden="true" />
        <div className="flex flex-wrap items-center justify-between gap-[12px] px-[20px] py-[14px]">
          <span className="font-cn text-[11px] text-[var(--color-ink-3)]">
            {copy.footer.policy.replace('{days}', String(data.retentionDays))}
            {' · '}
            {copy.footer.shown
              .replace('{shown}', String(data.items.length))
              .replace('{total}', String(data.total))}
            {data.expired > 0 ? (
              <>
                {' · '}
                <span className="text-[#a8611a]">
                  {copy.footer.expired.replace('{n}', String(data.expired))}
                </span>
              </>
            ) : null}
          </span>

          <Button
            variant="outline"
            size="sm"
            loading={loadingMore}
            disabled={!canLoadMore}
            title={canLoadMore ? undefined : '已到底'}
            onClick={() => {
              const next = page + 1
              setPage(next)
              void load(next)
            }}
          >
            {copy.loadMore}
          </Button>
        </div>
      </section>

      <RetentionModal
        open={policyOpen}
        data={data}
        onClose={() => setPolicyOpen(false)}
        onDone={(message) => {
          setPolicyOpen(false)
          setNotice(message)
          setPage(1)
          void load(1)
        }}
      />
    </div>
  )
}

/* ------------------------------------------------------------------ 行 */
function LogRow({ row, first }: { row: AuditLogRow; first: boolean }) {
  const isSystem = row.actorKind === 'system'
  const failed = row.result === 'failed'

  return (
    <div
      className={[
        'flex items-center gap-[12px] px-[20px] py-[14px] transition-colors hover:bg-[var(--color-bg-soft)]',
        first ? '' : 'border-t border-[var(--color-line-soft)]',
      ].join(' ')}
    >
      <Col width={110} className="font-latin text-[11.5px] text-[var(--color-ink-3)]">
        {row.atLabel}
      </Col>

      <Col grow>
        <span
          className={[
            'block truncate font-cn text-[12px]',
            isSystem ? 'text-[var(--color-ink-3)]' : 'text-[var(--color-ink)]',
          ].join(' ')}
          title={isSystem ? copy.systemActor : row.actor}
        >
          {isSystem ? copy.systemActor : row.actor}
        </span>
      </Col>

      <Col width={130} className="font-latin text-[11.5px] text-[var(--color-ink-3)]">
        {row.ip ? (
          <span className="block truncate" title={row.ip}>{row.ip}</span>
        ) : (
          <span className="text-[var(--color-ink-3)]">—</span>
        )}
      </Col>

      <Col grow>
        <span className="block truncate font-cn text-[12px] text-[var(--color-ink-2)]" title={row.text}>
          {row.text}
          {row.actionKnown ? null : (
            <span className="ml-[6px] rounded-[4px] bg-[var(--admin-soft-strong)] px-[5px] py-[1px] font-latin text-[10px] text-[var(--color-ink-3)]">
              {row.action}
            </span>
          )}
        </span>
      </Col>

      <Col width={80} className="font-cn text-[11.5px] font-medium">
        <span className={failed ? 'text-[#b4460c]' : 'text-[#3f7f52]'}>
          {failed ? copy.resultLabel.failed : copy.resultLabel.success}
        </span>
      </Col>
    </div>
  )
}

/* ------------------------------------------------------------------ 保留策略 */
function RetentionModal({
  open,
  data,
  onClose,
  onDone,
}: {
  open: boolean
  data: AuditLogResponse
  onClose: () => void
  onDone: (message: string) => void
}) {
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState('')

  const cutoff = new Date(Date.now() - data.retentionDays * 86400000).toISOString().slice(0, 10)

  useEffect(() => {
    if (!open) {
      setConfirming(false)
      setError('')
    }
  }, [open])

  const prune = async () => {
    setBusy(true)
    setError('')
    try {
      const res = await adminApi.pruneAuditLogs(data.retentionDays)
      setConfirming(false)
      onDone(copy.retention.done.replace('{n}', String(res.removed)))
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '清理失败')
    } finally {
      setBusy(false)
    }
  }

  if (confirming) {
    return (
      <Modal
        open={open}
        onClose={() => setConfirming(false)}
        title={copy.retention.confirmTitle}
        width={420}
        footer={
          <>
            <span />
            <div className="flex items-center gap-[10px]">
              <Button variant="outline" size="sm" disabled={busy} onClick={() => setConfirming(false)}>
                {copy.retention.close}
              </Button>
              <Button variant="danger" size="sm" loading={busy} onClick={() => void prune()}>
                {copy.retention.action.replace('{days}', String(data.retentionDays))}
              </Button>
            </div>
          </>
        }
      >
        <p className="font-cn text-[12.5px] leading-[1.8] text-[var(--color-ink-2)]">
          {copy.retention.confirmBody
            .replace('{cutoff}', cutoff)
            .replace('{n}', String(data.expired))}
        </p>
        {error ? (
          <div className="mt-[14px]">
            <Notice tone="error">{error}</Notice>
          </div>
        ) : null}
      </Modal>
    )
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={copy.retention.title}
      width={460}
      footer={
        <>
          <span className="font-cn text-[11px] text-[var(--color-ink-3)]">{copy.footer.refreshed.replace('{time}', '刚刚')}</span>
          <div className="flex items-center gap-[10px]">
            <Button variant="outline" size="sm" onClick={onClose}>
              {copy.retention.close}
            </Button>
            <Button
              variant={data.expired > 0 ? 'danger' : 'outline'}
              size="sm"
              disabled={data.expired === 0}
              title={data.expired === 0 ? copy.retention.nothingToDo : undefined}
              onClick={() => setConfirming(true)}
            >
              {copy.retention.action.replace('{days}', String(data.retentionDays))}
            </Button>
          </div>
        </>
      }
    >
      <p className="font-cn text-[12.5px] leading-[1.85] text-[var(--color-ink-2)]">
        {copy.retention.body.replace('{days}', String(data.retentionDays))}
      </p>
      <p className="mt-[12px] font-cn text-[12.5px] leading-[1.85] text-[var(--color-ink-2)]">
        {data.expired > 0
          ? copy.retention.current
              .replace('{total}', String(data.total))
              .replace('{expired}', String(data.expired))
              .replace('{days}', String(data.retentionDays))
          : copy.retention.nothingToDo}
      </p>
    </Modal>
  )
}
