import { useDeferredValue, useMemo, useState } from 'react'
import type { Channel, Transaction } from '../api/types'
import { ScorePill } from '../components/badges'
import { RiskGauge } from '../components/charts'
import { SearchField, SegmentedControl } from '../components/controls'
import { Icon, type IconName } from '../components/Icon'
import { Empty, LivePill, Page } from '../components/Layout'
import { Sheet } from '../components/Sheet'
import { formatDateTime, formatKZT, formatTime } from '../lib/format'
import { CountryTag } from '../components/CountryTag'
import { CHANNEL, riskColor } from '../lib/labels'
import { useLive, useLiveStore } from '../live/LiveProvider'

type Filter = 'all' | 'flagged' | 'alerts'

const CHANNEL_ICON: Record<Channel, { icon: IconName; color: string }> = {
  transfer: { icon: 'transfer', color: 'var(--blue)' },
  card: { icon: 'card', color: 'var(--indigo)' },
  cash: { icon: 'banknote', color: 'var(--green)' },
  swift: { icon: 'globe', color: 'var(--teal)' },
  p2p: { icon: 'people', color: 'var(--purple)' },
  crypto: { icon: 'bitcoin', color: 'var(--orange)' },
}

export function ChannelLabel({ channel }: { channel: Channel }) {
  const meta = CHANNEL_ICON[channel]
  return (
    <span className="channel" style={{ ['--c' as string]: meta.color }}>
      <Icon name={meta.icon} size={15} />
      {CHANNEL[channel]}
    </span>
  )
}

export function filterTransactions(items: Transaction[], filter: Filter, q: string): Transaction[] {
  const min = filter === 'alerts' ? 65 : filter === 'flagged' ? 1 : 0
  const needle = q.trim().toLowerCase()
  return items.filter(
    (t) =>
      t.risk_score >= min &&
      (!needle ||
        t.sender.name.toLowerCase().includes(needle) ||
        t.receiver.name.toLowerCase().includes(needle) ||
        t.purpose.toLowerCase().includes(needle)),
  )
}

export function LivePage() {
  const live = useLive()
  const store = useLiveStore()
  const [filter, setFilter] = useState<Filter>('all')
  const [q, setQ] = useState('')
  const [selected, setSelected] = useState<Transaction | null>(null)
  const deferredQ = useDeferredValue(q)
  const rows = useMemo(() => filterTransactions(live.items, filter, deferredQ), [live.items, filter, deferredQ])

  const pauseBtn = (
    <button type="button" className={`btn ${live.paused ? 'btn--filled' : 'btn--gray'}`} onClick={() => store.setPaused(!live.paused)}>
      <Icon name={live.paused ? 'play' : 'pause'} size={14} strokeWidth={2.4} />
      {live.paused ? `Продолжить${live.pending ? ` (+${live.pending})` : ''}` : 'Пауза'}
    </button>
  )

  return (
    <Page
      title="Live-лента"
      subtitle="Операции поступают по WebSocket сразу после скоринга в Celery-воркере"
      barActions={pauseBtn}
      actions={
        <>
          <LivePill />
          {pauseBtn}
        </>
      }
    >
      <div className="toolbar">
        <SegmentedControl
          label="Фильтр"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'Все' },
            { value: 'flagged', label: 'С флагами' },
            { value: 'alerts', label: 'Алерты ≥65' },
          ]}
        />
        <SearchField value={q} onChange={setQ} placeholder="Клиент, получатель, назначение" />
      </div>

      <section className="card card--flush">
        {rows.length === 0 ? (
          live.status === 'open' || live.items.length ? (
            <Empty icon="waveform" title="Нет операций" text="Измените фильтр или подождите новых транзакций" />
          ) : (
            <Empty icon="hourglass" title="Подключение к потоку…" text="WebSocket переподключается автоматически" />
          )
        ) : (
          <>
            <div className="tx-table-wrap">
              <table className="tx-table">
                <thead>
                  <tr>
                    <th>Время</th>
                    <th>Отправитель</th>
                    <th>Получатель</th>
                    <th>Канал</th>
                    <th className="num">Сумма</th>
                    <th className="num">Риск</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((t) => (
                    <tr
                      key={t.id}
                      className={`${live.fresh.has(t.id) ? 'is-new' : ''} ${t.risk_score >= 65 ? 'is-flagged' : ''}`}
                      onClick={() => setSelected(t)}
                      tabIndex={0}
                      onKeyDown={(e) => e.key === 'Enter' && setSelected(t)}
                    >
                      <td className="tabular secondary">{formatTime(t.ts)}</td>
                      <td>
                        <div className="party">
                          <span className="party__name truncate">{t.sender.name}</span>
                          <span className="party__meta">{t.sender.bank}</span>
                        </div>
                      </td>
                      <td>
                        <div className="party">
                          <span className="party__name truncate">
                            <CountryTag code={t.receiver.country} />
                            {t.receiver.name}
                          </span>
                          <span className="party__meta truncate">{t.purpose}</span>
                        </div>
                      </td>
                      <td>
                        <ChannelLabel channel={t.channel} />
                      </td>
                      <td className="num" style={{ fontWeight: 600 }}>
                        {formatKZT(t.amount)}
                      </td>
                      <td className="num">
                        <ScorePill score={t.risk_score} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="tx-cards">
              {rows.slice(0, 80).map((t) => (
                <button key={t.id} type="button" className="list-row" onClick={() => setSelected(t)}>
                  <ScorePill score={t.risk_score} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="truncate" style={{ fontWeight: 500 }}>{t.sender.name}</div>
                    <div className="caption truncate">→ {t.receiver.name}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div className="tabular" style={{ fontWeight: 600 }}>{formatKZT(t.amount, { compact: true })}</div>
                    <div className="caption tabular">{formatTime(t.ts)}</div>
                  </div>
                </button>
              ))}
            </div>
          </>
        )}
      </section>

      {selected && <TransactionSheet tx={selected} onClose={() => setSelected(null)} />}
    </Page>
  )
}

export function TransactionSheet({ tx, onClose }: { tx: Transaction; onClose: () => void }) {
  return (
    <Sheet title="Операция" onClose={onClose} narrow>
      <div className="row" style={{ gap: 16 }}>
        <RiskGauge score={tx.risk_score} color={riskColor(tx.risk_score)} />
        <div>
          <div className="title-2 tabular">{formatKZT(tx.amount)}</div>
          <div className="footnote">{formatDateTime(tx.ts)}</div>
        </div>
      </div>
      <div className="list-group">
        <div className="list-row">
          <span>Отправитель</span>
          <span className="list-row__value truncate">{tx.sender.name}</span>
        </div>
        <div className="list-row">
          <span>Получатель</span>
          <span className="list-row__value truncate">
            <CountryTag code={tx.receiver.country} /> {tx.receiver.name}
          </span>
        </div>
        <div className="list-row">
          <span>Канал</span>
          <span className="list-row__value">
            <ChannelLabel channel={tx.channel} />
          </span>
        </div>
        <div className="list-row">
          <span>Назначение</span>
          <span className="list-row__value truncate">{tx.purpose || '—'}</span>
        </div>
        <div className="list-row">
          <span>ML-аномальность</span>
          <span className="list-row__value tabular">{Math.round(tx.anomaly_score * 100)}%</span>
        </div>
        <div className="list-row">
          <span>ID</span>
          <span className="list-row__value mono truncate">{tx.id}</span>
        </div>
      </div>
      <div>
        <div className="list-group__title">Сработавшие правила</div>
        <div className="list-group">
          {tx.flags.length === 0 && <div className="list-row secondary">Признаков подозрительности нет</div>}
          {tx.flags.map((f) => (
            <div key={f.code} className="list-row">
              <Icon name="flag" size={16} style={{ color: 'var(--red)' }} />
              <span>{f.title}</span>
              <span className="list-row__value tabular">+{f.weight}</span>
            </div>
          ))}
        </div>
      </div>
    </Sheet>
  )
}
