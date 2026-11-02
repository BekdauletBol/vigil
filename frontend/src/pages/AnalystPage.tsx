import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAlert, useAlerts } from '../api/queries'
import type { Source } from '../api/types'
import { ScorePill, SeverityBadge } from '../components/badges'
import { Icon } from '../components/Icon'
import { Page } from '../components/Layout'
import { Sheet } from '../components/Sheet'
import { formatKZT } from '../lib/format'
import { Markdown } from '../lib/markdown'
import { useAnalystChat, type UIMessage } from './useAnalystChat'

const GENERAL_PROMPTS = [
  'Какие признаки указывают на дробление?',
  'Что проверить при переводе в офшорную компанию?',
  'Как структурировать заключение по кейсу?',
]

const CASE_PROMPTS = [
  'Сформируй заключение по кейсу',
  'Какие документы запросить у клиента?',
  'Есть ли признаки транзита по связям?',
]

const PROVIDER_LABEL: Record<string, string> = {
  anthropic: 'Claude',
  ollama: 'Локальная модель',
  mock: 'Офлайн-режим',
}

export function AnalystPage() {
  const [params, setParams] = useSearchParams()
  const alertId = params.get('alert') ? Number(params.get('alert')) : null
  const { data: alert } = useAlert(alertId)
  const { data: candidates } = useAlerts({ status: 'open', severity: 'critical' })
  const chat = useAnalystChat(alertId)
  const [draft, setDraft] = useState('')
  const [source, setSource] = useState<Source | null>(null)
  const scroller = useRef<HTMLDivElement>(null)

  // Opening the page with a case kicks off a report; switching cases starts a new conversation.
  useEffect(() => {
    if (alertId !== null) chat.start(`Сформируй заключение по кейсу #${alertId}`)
    else chat.reset()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alertId])

  useEffect(() => {
    const el = scroller.current
    if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 160) el.scrollTop = el.scrollHeight
  }, [chat.messages])

  const submit = (text = draft) => {
    if (chat.streaming || !text.trim()) return
    chat.send(text)
    setDraft('')
  }

  const lastSources = [...chat.messages].reverse().find((m) => m.sources?.length)?.sources ?? []
  const prompts = alertId ? CASE_PROMPTS : GENERAL_PROMPTS

  return (
    <Page
      title="AI-аналитик"
      subtitle="RAG по базе знаний типологий и данным кейса. Ответ стримится по SSE."
      actions={
        chat.provider && (
          <span className="badge" style={{ ['--c' as string]: 'var(--purple)' }}>
            <Icon name="cpu" size={13} />
            {PROVIDER_LABEL[chat.provider] ?? chat.provider}
          </span>
        )
      }
    >
      <div className="analyst">
        <section className="chat" aria-label="Диалог">
          <div className="chat__scroll" ref={scroller} aria-live="polite">
            {chat.messages.length === 0 && (
              <div className="empty" style={{ margin: 'auto' }}>
                <span className="assistant-avatar" style={{ width: 52, height: 52, borderRadius: 14 }}>
                  <Icon name="sparkles" size={28} />
                </span>
                <div className="title-3" style={{ color: 'var(--label)' }}>Чем помочь?</div>
                <div className="footnote" style={{ maxWidth: 420 }}>
                  Спросите о типологиях отмывания денег или выберите кейс справа — ассистент разберёт признаки, связи
                  и предложит следующие шаги. Решение всегда за аналитиком.
                </div>
              </div>
            )}
            {chat.messages.map((m) => (
              <Message key={m.id} message={m} onSource={setSource} />
            ))}
          </div>
          <div className="chat__footer">
            {!chat.streaming && (
              <div className="suggestions">
                {prompts.map((p) => (
                  <button key={p} type="button" className="suggestion" onClick={() => submit(alertId && p === CASE_PROMPTS[0] ? `${p} #${alertId}` : p)}>
                    {p}
                  </button>
                ))}
              </div>
            )}
            <div className="composer">
              <textarea
                rows={1}
                value={draft}
                aria-label="Сообщение"
                placeholder={alertId ? `Вопрос по кейсу #${alertId}…` : 'Спросите аналитика…'}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    submit()
                  }
                }}
              />
              {chat.streaming ? (
                <button type="button" className="send-btn send-btn--stop" aria-label="Остановить" onClick={chat.stop}>
                  <Icon name="stop" size={12} strokeWidth={3} fill="currentColor" />
                </button>
              ) : (
                <button type="button" className="send-btn" aria-label="Отправить" disabled={!draft.trim()} onClick={() => submit()}>
                  <Icon name="arrowUp" size={16} strokeWidth={2.6} />
                </button>
              )}
            </div>
          </div>
        </section>

        <aside className="analyst__side stack" style={{ gap: 20 }}>
          <div>
            <div className="list-group__title">Контекст</div>
            <div className="list-group">
              {alert ? (
                <div className="list-row" style={{ alignItems: 'flex-start', paddingTop: 12, paddingBottom: 12 }}>
                  <ScorePill score={alert.score} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="headline truncate">#{alert.id} · {alert.account.name}</div>
                    <div className="caption">{alert.typology}</div>
                    <div className="row" style={{ marginTop: 6 }}>
                      <SeverityBadge severity={alert.severity} />
                      <span className="footnote tabular">{formatKZT(alert.transaction.amount, { compact: true })}</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="list-row secondary">Общие вопросы · без кейса</div>
              )}
              {alertId !== null && (
                <button type="button" className="list-row" style={{ color: 'var(--accent)' }} onClick={() => setParams({})}>
                  Убрать контекст кейса
                </button>
              )}
            </div>
          </div>

          {!alertId && candidates && candidates.items.length > 0 && (
            <div>
              <div className="list-group__title">Критические кейсы</div>
              <div className="list-group">
                {candidates.items.slice(0, 5).map((a) => (
                  <button key={a.id} type="button" className="list-row" onClick={() => setParams({ alert: String(a.id) })}>
                    <ScorePill score={a.score} />
                    <span className="truncate" style={{ flex: 1 }}>#{a.id} · {a.account.name}</span>
                    <Icon name="chevronRight" size={13} className="list-row__chevron" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {lastSources.length > 0 && (
            <div>
              <div className="list-group__title">Источники ответа</div>
              <div className="list-group">
                {lastSources.map((s, i) => (
                  <button key={s.id} type="button" className="list-row" onClick={() => setSource(s)}>
                    <span className="row-icon" style={{ ['--c' as string]: 'var(--indigo)', width: 26, height: 26, borderRadius: 7, fontSize: 12, fontWeight: 700 }}>
                      {i + 1}
                    </span>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div className="truncate" style={{ fontSize: 14, fontWeight: 500 }}>{s.doc}</div>
                      <div className="caption truncate">{s.section} · релевантность {Math.round(s.score * 100)}%</div>
                    </div>
                  </button>
                ))}
              </div>
              <div className="list-group__footer">TF-IDF поиск по локальной базе знаний — данные не покидают контур.</div>
            </div>
          )}
        </aside>
      </div>

      {source && (
        <Sheet title={`${source.doc} — ${source.section}`} onClose={() => setSource(null)} narrow>
          <Markdown text={source.text} />
        </Sheet>
      )}
    </Page>
  )
}

function Message({ message: m, onSource }: { message: UIMessage; onSource: (s: Source) => void }) {
  if (m.role === 'user')
    return (
      <div className="msg msg--user">
        <div className="bubble">{m.content}</div>
      </div>
    )
  const cite = (n: number) => {
    const s = m.sources?.[n - 1]
    if (s) onSource(s)
  }
  return (
    <div className="msg msg--assistant">
      <span className="assistant-avatar">
        <Icon name="sparkles" size={16} />
      </span>
      <div className="assistant-body">
        {m.content ? (
          <>
            <Markdown text={m.content} onCite={cite} />
            {m.streaming && <span className="caret" />}
          </>
        ) : m.streaming ? (
          <span className="typing" aria-label="Ассистент печатает">
            <i />
            <i />
            <i />
          </span>
        ) : null}
        {m.error && (
          <div className="badge sev-high" style={{ marginTop: 8, height: 'auto', padding: '4px 10px', whiteSpace: 'normal' }}>
            {m.error}
          </div>
        )}
        {!m.streaming && m.sources && m.sources.length > 0 && (
          <div className="sources">
            {m.sources.map((s, i) => (
              <button key={s.id} type="button" className="source-chip" onClick={() => onSource(s)}>
                <b>{i + 1}</b>
                <span className="truncate">{s.doc}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
