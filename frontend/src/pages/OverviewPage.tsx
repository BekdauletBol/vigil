import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAlerts, useStats } from '../api/queries'
import { ScorePill, SeverityBadge } from '../components/badges'
import { ActivityRings, AreaChart, BarList, Sparkline } from '../components/charts'
import { SegmentedControl } from '../components/controls'
import { Icon, type IconName } from '../components/Icon'
import { LivePill, Page } from '../components/Layout'
import { formatKZT, formatNumber, formatRelative } from '../lib/format'
import { CHANNEL } from '../lib/labels'
import { useLive } from '../live/LiveProvider'

function Kpi({ icon, color, label, value, unit, caption, spark }: {
  icon: IconName
  color: string
  label: string
  value: string
  unit?: string
  caption?: string
  spark?: number[]
}) {
  return (
    <div className="card kpi" style={{ ['--c' as string]: color }}>
      <span className="kpi__label">
        <Icon name={icon} size={15} strokeWidth={2.1} />
        {label}
      </span>
      <span className="kpi__value">
        {value}
        {unit && <small>{unit}</small>}
      </span>
      {caption && <span className="caption">{caption}</span>}
      {spark && <Sparkline values={spark} color={color} />}
    </div>
  )
}

const timeLabel = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' })

export function OverviewPage() {
  const { data: s, isLoading, isError } = useStats()
  const { rate } = useLive()
  const [metric, setMetric] = useState<'count' | 'volume'>('count')
  const { data: critical } = useAlerts({ severity: 'critical', status: 'open' })

  const today = new Intl.DateTimeFormat('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())

  if (isError) {
    return (
      <Page title="Обзор" subtitle={today}>
        <div className="card empty">
          <Icon name="alert" size={36} />
          <div className="headline">API недоступен</div>
          <div className="footnote">Проверьте, что backend запущен на :8000</div>
        </div>
      </Page>
    )
  }

  const totalAlerts = s ? Object.values(s.alerts_by_status).reduce((a, b) => a + b, 0) : 0
  const touched = s ? totalAlerts - s.alerts_by_status.open : 0

  return (
    <Page title="Обзор" subtitle={<span style={{ textTransform: 'capitalize' }}>{today}</span>} actions={<LivePill />}>
      <div className="grid grid--kpi">
        {isLoading || !s ? (
          [0, 1, 2, 3].map((i) => <div key={i} className="card skeleton" style={{ height: 132 }} />)
        ) : (
          <>
            <Kpi icon="transfer" color="var(--blue)" label="Операции, 24 ч" value={formatNumber(s.tx_count_24h)} caption={`${rate} в минуту сейчас`} spark={s.series.map((p) => p.count)} />
            <Kpi icon="banknote" color="var(--green)" label="Объём, 24 ч" value={formatKZT(s.volume_24h, { compact: true })} caption="Все каналы" spark={s.series.map((p) => p.volume)} />
            <Kpi icon="alert" color="var(--red)" label="Открытые алерты" value={formatNumber(s.open_alerts)} caption={`${s.critical_alerts} критических`} spark={s.series.map((p) => p.flagged)} />
            <Kpi icon="shield" color="var(--orange)" label="Средний риск" value={s.avg_risk_24h.toFixed(1)} unit="/100" caption={`${formatNumber(s.flagged_24h)} операций с флагами`} />
          </>
        )}
      </div>

      <div className="grid grid--overview">
        <section className="card">
          <div className="card__header">
            <h2 className="headline">Поток операций · 60 минут</h2>
            <SegmentedControl
              label="Метрика"
              value={metric}
              onChange={setMetric}
              options={[
                { value: 'count', label: 'Количество' },
                { value: 'volume', label: 'Объём' },
              ]}
            />
          </div>
          {s ? (
            <AreaChart
              data={s.series.map((p) => ({
                label: timeLabel.format(new Date(p.t)),
                value: metric === 'count' ? p.count : p.volume,
                secondary: metric === 'count' ? p.flagged : undefined,
              }))}
              format={(v) => (metric === 'count' ? formatNumber(v) : formatKZT(v, { compact: true }))}
              secondaryLabel="С флагами"
            />
          ) : (
            <div className="skeleton" style={{ height: 220 }} />
          )}
        </section>

        <section className="card">
          <div className="card__header">
            <h2 className="headline">Состояние очереди</h2>
          </div>
          {s && (
            <ActivityRings
              rings={[
                { label: 'Алертов разобрано', value: totalAlerts ? touched / totalAlerts : 0, color: 'var(--pink)', caption: `${touched}/${totalAlerts}` },
                { label: 'Закрыто', value: totalAlerts ? s.alerts_by_status.closed / totalAlerts : 0, color: 'var(--green)', caption: `${s.alerts_by_status.closed}` },
                { label: 'Поток, опер./мин (цель 60)', value: rate / 60, color: 'var(--cyan)', caption: `${rate}` },
              ]}
            />
          )}
        </section>
      </div>

      <div className="grid grid--halves">
        <section className="card">
          <div className="card__header">
            <h2 className="headline">Признаки в алертах · 7 дней</h2>
          </div>
          {s && s.top_typologies.length > 0 ? (
            <BarList color="var(--red)" items={s.top_typologies.map((t) => ({ label: t.title, value: t.count }))} />
          ) : (
            <div className="footnote">Нет данных</div>
          )}
        </section>
        <section className="card">
          <div className="card__header">
            <h2 className="headline">Каналы · объём 24 ч</h2>
          </div>
          {s && (
            <BarList
              items={s.by_channel.map((c) => ({
                label: `${CHANNEL[c.channel] ?? c.channel} · ${formatNumber(c.count)} опер.`,
                value: c.volume,
                display: formatKZT(c.volume, { compact: true }),
              }))}
            />
          )}
        </section>
      </div>

      <section className="card card--flush">
        <div className="card__header">
          <h2 className="headline">Критические алерты без исполнителя</h2>
          <Link to="/alerts" className="btn btn--plain">
            Все алерты
          </Link>
        </div>
        <div style={{ paddingTop: 8 }}>
          {(critical?.items ?? []).slice(0, 5).map((a) => (
            <Link key={a.id} to={`/alerts/${a.id}`} className="list-row list-row--icon">
              <ScorePill score={a.score} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="truncate" style={{ fontWeight: 500 }}>
                  #{a.id} · {a.account.name}
                </div>
                <div className="caption truncate">{a.typology}</div>
              </div>
              <span className="hide-sm">
                <SeverityBadge severity={a.severity} />
              </span>
              <span className="footnote tabular" style={{ whiteSpace: 'nowrap' }}>
                {formatRelative(a.created_at)}
              </span>
              <Icon name="chevronRight" size={14} className="list-row__chevron" />
            </Link>
          ))}
          {critical && critical.items.length === 0 && <div className="empty">Критических алертов нет 🎉</div>}
        </div>
      </section>
    </Page>
  )
}
