import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ApiError } from '../api/client'
import { useAddNote, useAlert, useUpdateAlert } from '../api/queries'
import type { AlertDetail, AlertStatus } from '../api/types'
import { ScorePill, SeverityBadge, StatusBadge } from '../components/badges'
import { RiskGauge } from '../components/charts'
import { SegmentedControl } from '../components/controls'
import { Icon, type IconName } from '../components/Icon'
import { NetworkGraph } from '../components/NetworkGraph'
import { Sheet } from '../components/Sheet'
import { useToast } from '../components/Toasts'
import { formatDateTime, formatKZT, formatRelative, formatTime } from '../lib/format'
import { CountryTag } from '../components/CountryTag'
import { COUNTRY, riskColor, STATUS, TRANSITIONS } from '../lib/labels'
import { usePrefs } from '../theme/PrefsProvider'
import { ChannelLabel } from './LivePage'

type Tab = 'overview' | 'graph' | 'transactions' | 'journal'

const ACTION: Record<AlertStatus, { label: string; icon: IconName; tone: string }> = {
  investigating: { label: 'Взять в работу', icon: 'person', tone: '' },
  escalated: { label: 'Эскалировать', icon: 'escalate', tone: 'btn--orange' },
  closed: { label: 'Закрыть', icon: 'checkCircle', tone: 'btn--green' },
  open: { label: 'Вернуть', icon: 'arrowRight', tone: '' },
}

export function AlertSheet({ id, onClose }: { id: number; onClose: () => void }) {
  const { data: alert, isLoading, isError } = useAlert(id)
  const [tab, setTab] = useState<Tab>('overview')
  const { prefs } = usePrefs()
  const update = useUpdateAlert(prefs.analystName)
  const toast = useToast()
  const navigate = useNavigate()

  const transition = (status: AlertStatus) =>
    update.mutate(
      { id, status, ...(status === 'investigating' && !alert?.assignee ? { assignee: prefs.analystName } : {}) },
      {
        onSuccess: () => toast({ title: `Кейс #${id}: ${STATUS[status]}`, icon: ACTION[status].icon, color: 'var(--green)' }),
        onError: (e) =>
          toast({ title: 'Не удалось изменить статус', text: e instanceof ApiError ? e.message : String(e), icon: 'alert', color: 'var(--red)' }),
      },
    )

  return (
    <Sheet
      title={
        <span className="row">
          Кейс #{id}
          {alert && <StatusBadge status={alert.status} />}
        </span>
      }
      onClose={onClose}
      actions={
        <button type="button" className="btn btn--tinted" onClick={() => navigate(`/app/analyst?alert=${id}`)}>
          <Icon name="sparkles" size={15} />
          <span className="hide-sm">AI-заключение</span>
        </button>
      }
    >
      {isLoading && <div className="skeleton" style={{ height: 320 }} />}
      {isError && <div className="empty">Кейс не найден</div>}
      {alert && (
        <>
          <div className="card detail-hero">
            <RiskGauge score={alert.score} size={104} color={riskColor(alert.score)} />
            <div className="detail-hero__main">
              <div className="row wrap" style={{ gap: 6, marginBottom: 6 }}>
                <SeverityBadge severity={alert.severity} />
                <span className="caption">создан {formatRelative(alert.created_at)}</span>
              </div>
              <div className="title-3">{alert.typology}</div>
              <div className="subhead truncate">
                {alert.account.name} · {formatKZT(alert.transaction.amount)}
              </div>
            </div>
            <div className="detail-hero__actions">
              {TRANSITIONS[alert.status].map((s) => (
                <button
                  key={s}
                  type="button"
                  className={`btn ${s === 'investigating' || s === 'escalated' ? 'btn--filled' : 'btn--tinted'} ${ACTION[s].tone}`}
                  onClick={() => transition(s)}
                  disabled={update.isPending}
                >
                  <Icon name={ACTION[s].icon} size={15} strokeWidth={2.1} />
                  {ACTION[s].label}
                </button>
              ))}
            </div>
          </div>

          <SegmentedControl
            label="Раздел кейса"
            value={tab}
            onChange={setTab}
            options={[
              { value: 'overview', label: 'Обзор' },
              { value: 'graph', label: 'Связи' },
              { value: 'transactions', label: 'Операции', count: alert.related.length },
              { value: 'journal', label: 'Журнал', count: alert.notes.length },
            ]}
          />

          {tab === 'overview' && <OverviewTab alert={alert} />}
          {tab === 'graph' && <NetworkGraph nodes={alert.graph_nodes} edges={alert.graph_edges} />}
          {tab === 'transactions' && <TransactionsTab alert={alert} />}
          {tab === 'journal' && <JournalTab alert={alert} />}
        </>
      )}
    </Sheet>
  )
}

function OverviewTab({ alert }: { alert: AlertDetail }) {
  const tx = alert.transaction
  const maxWeight = Math.max(...alert.flags.map((f) => f.weight), 1)
  return (
    <div className="grid grid--halves">
      <div className="stack" style={{ gap: 18 }}>
        <div>
          <div className="list-group__title">Признаки · вклад в риск</div>
          <div className="card stack" style={{ gap: 12 }}>
            {alert.flags.map((f) => (
              <div key={f.code} className="flag-row">
                <span className="truncate" style={{ fontSize: 14 }}>{f.title}</span>
                <div className="bar-list__track">
                  <div className="bar-list__fill" style={{ width: `${(f.weight / maxWeight) * 100}%`, ['--c' as string]: 'var(--red)' }} />
                </div>
                <span className="tabular secondary" style={{ textAlign: 'right' }}>+{f.weight}</span>
              </div>
            ))}
          </div>
        </div>
        <div>
          <div className="list-group__title">Операция</div>
          <div className="list-group">
            <Row label="Сумма" value={<b className="tabular">{formatKZT(tx.amount)}</b>} />
            <Row label="Время" value={formatDateTime(tx.ts)} />
            <Row label="Канал" value={<ChannelLabel channel={tx.channel} />} />
            <Row label="Получатель" value={<><CountryTag code={tx.receiver.country} /> {tx.receiver.name}</>} />
            <Row label="Назначение" value={tx.purpose || '—'} />
            <Row label="ML-аномальность" value={`${Math.round(tx.anomaly_score * 100)}%`} />
          </div>
        </div>
      </div>
      <div>
        <div className="list-group__title">Субъект</div>
        <div className="list-group">
          <Row label="Наименование" value={alert.account.name} />
          <Row label="Тип" value={alert.account.kind === 'legal' ? 'Юридическое лицо' : 'Физическое лицо'} />
          <Row label="ИИН/БИН" value={<span className="mono">{alert.account.tax_id}</span>} />
          <Row label="Банк" value={alert.account.bank} />
          <Row label="Город" value={`${alert.account.city}, ${COUNTRY[alert.account.country] ?? alert.account.country}`} />
          <Row label="Уровень риска" value={{ low: 'Низкий', medium: 'Средний', high: 'Высокий' }[alert.account.risk_level]} />
          <Row label="ПДЛ" value={alert.account.is_pep ? <span className="badge sev-high">Да</span> : 'Нет'} />
          <Row label="Счёт открыт" value={formatDateTime(alert.account.opened_at)} />
          <Row label="Исполнитель" value={alert.assignee ?? <span className="tertiary">Не назначен</span>} />
        </div>
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="list-row">
      <span style={{ flex: 'none' }}>{label}</span>
      <span className="list-row__value truncate">{value}</span>
    </div>
  )
}

function TransactionsTab({ alert }: { alert: AlertDetail }) {
  return (
    <div className="list-group">
      {alert.related.map((t) => {
        const outgoing = t.sender.id === alert.account.id
        return (
          <div key={t.id} className="list-row">
            <ScorePill score={t.risk_score} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div className="truncate" style={{ fontWeight: 500 }}>
                {outgoing ? '→ ' : '← '}
                {outgoing ? t.receiver.name : t.sender.name}
              </div>
              <div className="caption truncate">
                {formatDateTime(t.ts)} · {t.purpose}
              </div>
            </div>
            <div className="tabular" style={{ fontWeight: 600, color: outgoing ? 'var(--label)' : 'var(--green)', whiteSpace: 'nowrap' }}>
              {outgoing ? '−' : '+'}
              {formatKZT(t.amount, { compact: true })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function JournalTab({ alert }: { alert: AlertDetail }) {
  const { prefs } = usePrefs()
  const addNote = useAddNote(prefs.analystName)
  const [text, setText] = useState('')
  const submit = () => {
    const value = text.trim()
    if (!value) return
    addNote.mutate({ id: alert.id, text: value }, { onSuccess: () => setText('') })
  }
  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="timeline">
        {alert.notes.length === 0 && <div className="footnote">Записей пока нет</div>}
        {alert.notes.map((n) => (
          <div key={n.id} className="timeline__item">
            <span className={`timeline__icon ${n.kind === 'comment' ? 'is-comment' : ''}`}>
              <Icon name={n.kind === 'comment' ? 'comment' : 'clock'} size={14} />
            </span>
            <div>
              <div className="row" style={{ gap: 6 }}>
                <span className="headline" style={{ fontSize: 14 }}>{n.author}</span>
                <span className="caption tabular">
                  {formatDateTime(n.created_at)} · {formatTime(n.created_at)}
                </span>
              </div>
              <div style={{ whiteSpace: 'pre-wrap' }}>{n.text}</div>
            </div>
          </div>
        ))}
      </div>
      <div className="composer">
        <textarea
          rows={1}
          value={text}
          placeholder="Комментарий к кейсу…"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit()
          }}
        />
        <button type="button" className="send-btn" aria-label="Добавить комментарий" disabled={!text.trim() || addNote.isPending} onClick={submit}>
          <Icon name="arrowUp" size={16} strokeWidth={2.6} />
        </button>
      </div>
    </div>
  )
}
