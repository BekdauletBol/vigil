import { useDeferredValue } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useAlerts } from '../api/queries'
import type { AlertStatus, Severity } from '../api/types'
import { Avatar, ScorePill, SeverityBadge, StatusBadge } from '../components/badges'
import { SearchField, SegmentedControl } from '../components/controls'
import { Icon } from '../components/Icon'
import { Empty, Page } from '../components/Layout'
import { formatKZT, formatRelative } from '../lib/format'
import { SEVERITY, STATUS } from '../lib/labels'
import { AlertSheet } from './AlertSheet'

type StatusFilter = AlertStatus | 'all'
type SeverityFilter = Severity | 'all'

const SEV_COLOR: Record<Severity, string> = {
  low: 'var(--gray)',
  medium: 'var(--orange)',
  high: 'var(--red)',
  critical: 'var(--pink)',
}

export function AlertsPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const status = (params.get('status') ?? 'open') as StatusFilter
  const severity = (params.get('severity') ?? 'all') as SeverityFilter
  const q = params.get('q') ?? ''
  const deferredQ = useDeferredValue(q)

  const setParam = (key: string, value: string, fallback: string) =>
    setParams(
      (p) => {
        if (value === fallback) p.delete(key)
        else p.set(key, value)
        return p
      },
      { replace: true },
    )

  const { data, isLoading, isFetching } = useAlerts({
    status: status === 'all' ? undefined : status,
    severity: severity === 'all' ? undefined : severity,
    q: deferredQ || undefined,
  })
  const counts = data?.counts
  const total = counts ? Object.values(counts).reduce((a, b) => a + b, 0) : undefined

  return (
    <Page
      title="Алерты"
      subtitle={data ? `${data.total} в выборке${isFetching ? ' · обновление…' : ''}` : 'Загрузка…'}
    >
      <div className="toolbar">
        <SegmentedControl
          label="Статус"
          className="segmented--scroll"
          value={status}
          onChange={(v) => setParam('status', v, 'open')}
          options={[
            ...(['open', 'investigating', 'escalated', 'closed'] as const).map((s) => ({ value: s, label: STATUS[s], count: counts?.[s] })),
            { value: 'all' as const, label: 'Все', count: total },
          ]}
        />
        <SegmentedControl
          label="Уровень"
          value={severity}
          onChange={(v) => setParam('severity', v, 'all')}
          options={[
            { value: 'all', label: 'Любой' },
            { value: 'critical', label: SEVERITY.critical },
            { value: 'high', label: SEVERITY.high },
            { value: 'medium', label: SEVERITY.medium },
          ]}
        />
        <SearchField value={q} onChange={(v) => setParam('q', v, '')} placeholder="Клиент, типология или #номер" />
      </div>

      <section className="card card--flush" aria-busy={isLoading}>
        {isLoading &&
          Array.from({ length: 6 }, (_, i) => <div key={i} className="skeleton" style={{ height: 44, margin: '14px 18px' }} />)}
        {data && data.items.length === 0 && <Empty icon="checkCircle" title="Алертов нет" text="По заданным фильтрам ничего не найдено" />}
        {data?.items.map((a) => (
          <button
            key={a.id}
            type="button"
            className="alert-row"
            style={{ ['--c' as string]: SEV_COLOR[a.severity] }}
            onClick={() => navigate({ pathname: `/app/alerts/${a.id}`, search: params.toString() })}
          >
            <span className="alert-row__stripe" />
            <span className="alert-row__id hide-sm">#{a.id}</span>
            <span className="alert-row__subject">
              <span className="row" style={{ gap: 8 }}>
                <ScorePill score={a.score} />
                <span className="truncate" style={{ fontWeight: 600 }}>
                  {a.account.name}
                </span>
              </span>
              <span className="caption truncate" style={{ display: 'block', marginTop: 3 }}>
                {a.typology} · {formatRelative(a.created_at)}
              </span>
            </span>
            <span className="hide-md row wrap" style={{ gap: 6 }}>
              <SeverityBadge severity={a.severity} />
              <StatusBadge status={a.status} />
            </span>
            <span className="alert-row__amount">{formatKZT(a.transaction.amount, { compact: true })}</span>
            <span className="hide-md hide-sm row" style={{ gap: 8, minWidth: 0 }}>
              {a.assignee ? (
                <>
                  <Avatar name={a.assignee} size={22} />
                  <span className="footnote truncate">{a.assignee}</span>
                </>
              ) : (
                <span className="footnote tertiary">Не назначен</span>
              )}
            </span>
            <Icon name="chevronRight" size={14} className="list-row__chevron hide-sm" />
          </button>
        ))}
      </section>

      {id && <AlertSheet id={Number(id)} onClose={() => navigate({ pathname: '/app/alerts', search: params.toString() })} />}
    </Page>
  )
}
