import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, ApiError } from '../api/client'
import { Switch } from '../components/controls'
import { Icon } from '../components/Icon'
import { useToast } from '../components/Toasts'
import { useSession } from '../session/SessionProvider'

const origin = typeof window !== 'undefined' ? window.location.origin : ''

/** Workspace & account section of Settings — only for signed-in users in their own workspace. */
export function WorkspaceSettings() {
  const { workspace, user, refresh, logout } = useSession()
  const qc = useQueryClient()
  const toast = useToast()
  const navigate = useNavigate()
  const [apiKey, setApiKey] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const onError = (e: unknown) =>
    toast({ title: 'Ошибка', text: e instanceof ApiError ? e.message : String(e), icon: 'alert', color: 'var(--red)' })

  const rotate = useMutation({
    mutationFn: () => api.rotateApiKey(workspace!.id),
    onSuccess: (r) => {
      setApiKey(r.api_key)
      refresh()
    },
    onError,
  })
  const simulator = useMutation({
    mutationFn: (on: boolean) => api.updateWorkspace(workspace!.id, { simulator: on }),
    onSuccess: () => refresh(),
    onError,
  })
  const sample = useMutation({
    mutationFn: () => api.sampleData(workspace!.id),
    onSuccess: async (ws) => {
      await refresh()
      qc.invalidateQueries()
      toast({ title: 'Добавлены тестовые данные', text: `Всего клиентов: ${ws.accounts}`, icon: 'sparkles', color: 'var(--purple)' })
    },
    onError,
  })
  const reset = useMutation({
    mutationFn: () => api.resetData(workspace!.id),
    onSuccess: async () => {
      await refresh()
      qc.invalidateQueries()
      toast({ title: 'Данные пространства удалены', icon: 'checkCircle', color: 'var(--green)' })
    },
    onError,
  })

  if (!user || !workspace || workspace.kind !== 'private') return null
  const simOn = Boolean(workspace.simulator_until)
  const simUntil = workspace.simulator_until
    ? new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' }).format(new Date(workspace.simulator_until))
    : null
  const curl = `curl -X POST ${origin}/api/v1/transactions \\
  -H "X-API-Key: ${apiKey ?? 'vk_…'}" \\
  -H "Content-Type: application/json" \\
  -d '{"external_id": "BANK-1", "sender_id": "CL-00001",
       "receiver_id": "CL-00002", "amount": 250000,
       "channel": "transfer", "country": "KZ"}'`

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <>
      <section id="integration">
        <div className="list-group__title">Интеграция по API</div>
        <div className="list-group">
          <div className="list-row list-row--icon">
            <span className="row-icon" style={{ ['--c' as string]: 'var(--orange)' }}>
              <Icon name="bolt" size={17} />
            </span>
            <div style={{ minWidth: 0 }}>
              <div>API-ключ пространства</div>
              <div className="caption">
                {workspace.api_key_prefix ? `Активен: ${workspace.api_key_prefix}…` : 'Ключ ещё не выпущен'}
              </div>
            </div>
            <button type="button" className="btn btn--tinted" style={{ marginLeft: 'auto' }} onClick={() => rotate.mutate()} disabled={rotate.isPending}>
              {workspace.api_key_prefix ? 'Перевыпустить' : 'Выпустить ключ'}
            </button>
          </div>
          {apiKey && (
            <div className="list-row" style={{ display: 'block' }}>
              <div className="footnote" style={{ color: 'var(--orange)', marginBottom: 6 }}>
                Скопируйте ключ сейчас — он показывается один раз. Старый ключ больше не работает.
              </div>
              <div className="row">
                <code className="key-box">{apiKey}</code>
                <button type="button" className="btn btn--gray" onClick={() => copy(apiKey)}>
                  {copied ? 'Скопировано' : 'Копировать'}
                </button>
              </div>
            </div>
          )}
          <div className="list-row" style={{ display: 'block' }}>
            <div className="code-card code-card--inline">
              <pre>{curl}</pre>
            </div>
          </div>
        </div>
        <div className="list-group__footer">
          Отправляйте операции из своей системы. sender_id / receiver_id — коды клиентов; external_id защищает от дублей.{' '}
          <a href="/api/docs" target="_blank" rel="noreferrer">
            Документация API
          </a>
        </div>
      </section>

      <section>
        <div className="list-group__title">Данные пространства</div>
        <div className="list-group">
          <div className="list-row list-row--icon">
            <span className="row-icon" style={{ ['--c' as string]: 'var(--green)' }}>
              <Icon name="waveform" size={17} />
            </span>
            <div>
              <div>Симулятор потока операций</div>
              <div className="caption">{simOn ? `Работает до ${simUntil}` : 'Выключен · включается на 30 минут'}</div>
            </div>
            <span style={{ marginLeft: 'auto' }}>
              <Switch label="Симулятор" checked={simOn} onChange={(v) => simulator.mutate(v)} />
            </span>
          </div>
          <button type="button" className="list-row list-row--icon" onClick={() => sample.mutate()} disabled={sample.isPending}>
            <span className="row-icon" style={{ ['--c' as string]: 'var(--purple)' }}>
              <Icon name="sparkles" size={17} />
            </span>
            <span>{sample.isPending ? 'Генерируем…' : 'Добавить тестовых клиентов и операции'}</span>
            <span className="list-row__value tabular">
              {workspace.accounts} клиентов · {workspace.transactions} операций
            </span>
          </button>
          <button
            type="button"
            className="list-row list-row--icon"
            onClick={() => window.confirm('Удалить всех клиентов, операции и кейсы этого пространства?') && reset.mutate()}
          >
            <span className="row-icon" style={{ ['--c' as string]: 'var(--red)' }}>
              <Icon name="xmark" size={17} />
            </span>
            <span style={{ color: 'var(--red)' }}>Очистить пространство</span>
          </button>
        </div>
      </section>

      <section>
        <div className="list-group__title">Аккаунт</div>
        <div className="list-group">
          <div className="list-row list-row--icon">
            <span className="row-icon" style={{ ['--c' as string]: 'var(--blue)' }}>
              <Icon name="person" size={17} />
            </span>
            <div>
              <div>{user.name}</div>
              <div className="caption">{user.email}</div>
            </div>
          </div>
          <button
            type="button"
            className="list-row list-row--icon"
            onClick={() => {
              logout()
              navigate('/')
            }}
          >
            <span className="row-icon" style={{ ['--c' as string]: 'var(--gray)' }}>
              <Icon name="arrowRight" size={17} />
            </span>
            <span style={{ color: 'var(--red)' }}>Выйти</span>
          </button>
        </div>
      </section>
    </>
  )
}
