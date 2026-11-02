import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useDeferredValue, useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, ApiError, IMPORT_TEMPLATE_URL } from '../api/client'
import type { Account, Channel, ImportResult } from '../api/types'
import { Avatar } from '../components/badges'
import { SearchField, SegmentedControl, Switch } from '../components/controls'
import { CountryTag } from '../components/CountryTag'
import { Icon, type IconName } from '../components/Icon'
import { Empty, Page } from '../components/Layout'
import { Sheet } from '../components/Sheet'
import { useToast } from '../components/Toasts'
import { formatDateTime } from '../lib/format'
import { CHANNEL, COUNTRY } from '../lib/labels'
import { useSession } from '../session/SessionProvider'

type Dialog = 'client' | 'transaction' | 'import' | null

const RISK_LABEL = { low: 'Низкий', medium: 'Средний', high: 'Высокий' } as const
const RISK_CLASS = { low: 'sev-low', medium: 'sev-medium', high: 'sev-high' } as const

const errorText = (e: unknown) => (e instanceof ApiError ? e.message : 'Не удалось связаться с сервером')

export function ClientsPage() {
  const [q, setQ] = useState('')
  const deferred = useDeferredValue(q)
  const [dialog, setDialog] = useState<Dialog>(null)
  const { data: accounts, isLoading } = useQuery({ queryKey: ['accounts', deferred], queryFn: () => api.accounts(deferred || undefined) })
  const { isDemo } = useSession()
  const empty = !isLoading && accounts?.length === 0 && !deferred

  return (
    <Page
      title="Клиенты"
      subtitle="Клиенты и операции этого пространства. Новые операции сразу проходят скоринг."
      actions={
        <>
          <button type="button" className="btn btn--gray" onClick={() => setDialog('import')}>
            <Icon name="doc" size={15} />
            Импорт CSV
          </button>
          <button type="button" className="btn btn--gray" onClick={() => setDialog('client')}>
            <Icon name="person" size={15} />
            Новый клиент
          </button>
          <button type="button" className="btn btn--filled" onClick={() => setDialog('transaction')} disabled={(accounts?.length ?? 0) < 2}>
            <Icon name="transfer" size={15} />
            Новая операция
          </button>
        </>
      }
    >
      {empty ? (
        <Onboarding onPick={setDialog} />
      ) : (
        <>
          <div className="toolbar">
            <SearchField value={q} onChange={setQ} placeholder="Имя или код клиента" />
            {isDemo && <span className="footnote">Демо общее для всех посетителей — изменения увидят другие.</span>}
          </div>
          <section className="card card--flush">
            {isLoading && <div className="skeleton" style={{ height: 200, margin: 18 }} />}
            {accounts && accounts.length === 0 && <Empty icon="search" title="Ничего не найдено" />}
            {accounts && accounts.length > 0 && (
              <div className="tx-table-wrap" style={{ display: 'block' }}>
                <table className="tx-table">
                  <thead>
                    <tr>
                      <th>Клиент</th>
                      <th className="hide-sm">Код</th>
                      <th className="hide-sm">Банк</th>
                      <th>Риск-профиль</th>
                      <th className="hide-sm">Счёт открыт</th>
                    </tr>
                  </thead>
                  <tbody>
                    {accounts.map((a) => (
                      <tr key={a.id} style={{ cursor: 'default' }}>
                        <td>
                          <div className="row" style={{ gap: 10 }}>
                            <Avatar name={a.name} size={28} />
                            <div className="party">
                              <span className="party__name truncate">
                                {a.name} {a.is_pep && <span className="badge sev-high">ПДЛ</span>}
                              </span>
                              <span className="party__meta">
                                {a.kind === 'legal' ? 'Юрлицо' : 'Физлицо'} · <CountryTag code={a.country} hideDomestic={false} /> {a.city}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className="mono secondary hide-sm">{a.code}</td>
                        <td className="secondary hide-sm">{a.bank}</td>
                        <td>
                          <span className={`badge ${RISK_CLASS[a.risk_level]}`}>{RISK_LABEL[a.risk_level]}</span>
                        </td>
                        <td className="secondary tabular hide-sm">{formatDateTime(a.opened_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}

      {dialog === 'client' && <ClientSheet onClose={() => setDialog(null)} />}
      {dialog === 'transaction' && accounts && <TransactionSheet accounts={accounts} onClose={() => setDialog(null)} />}
      {dialog === 'import' && <ImportSheet onClose={() => setDialog(null)} />}
    </Page>
  )
}

function Onboarding({ onPick }: { onPick: (d: Dialog) => void }) {
  const { workspaceId, refresh } = useSession()
  const qc = useQueryClient()
  const toast = useToast()
  const navigate = useNavigate()
  const sample = useMutation({
    mutationFn: () => api.sampleData(workspaceId!),
    onSuccess: async (ws) => {
      await qc.invalidateQueries()
      await refresh()
      toast({ title: 'Тестовые данные созданы', text: `${ws.accounts} клиентов, ${ws.transactions} операций`, icon: 'checkCircle', color: 'var(--green)' })
    },
    onError: (e) => toast({ title: 'Не получилось', text: errorText(e), icon: 'alert', color: 'var(--red)' }),
  })

  const options: { icon: IconName; color: string; title: string; text: string; action: () => void; busy?: boolean }[] = [
    {
      icon: 'sparkles',
      color: 'var(--purple)',
      title: 'Сгенерировать тестовые данные',
      text: '25 клиентов и сутки операций с подозрительными схемами — чтобы сразу всё посмотреть.',
      action: () => sample.mutate(),
      busy: sample.isPending,
    },
    {
      icon: 'person',
      color: 'var(--blue)',
      title: 'Добавить клиентов вручную',
      text: 'Заведите клиентов, затем проведите между ними операцию и посмотрите скоринг.',
      action: () => onPick('client'),
    },
    {
      icon: 'doc',
      color: 'var(--teal)',
      title: 'Загрузить CSV',
      text: 'Выгрузка операций из банка. Неизвестные клиенты создадутся автоматически.',
      action: () => onPick('import'),
    },
    {
      icon: 'bolt',
      color: 'var(--orange)',
      title: 'Подключить по API',
      text: 'Получите API-ключ и отправляйте операции из своей системы, как настоящая интеграция.',
      action: () => navigate('/app/settings#integration'),
    },
  ]

  return (
    <section className="onboarding">
      <div>
        <h2 className="title-2">С чего начать</h2>
        <p className="subhead">Пространство пока пустое. Выберите, как добавить данные:</p>
      </div>
      <div className="onboarding__grid">
        {options.map((o) => (
          <button key={o.title} type="button" className="onboarding__card" onClick={o.action} disabled={o.busy}>
            <span className="row-icon" style={{ ['--c' as string]: o.color, width: 38, height: 38, borderRadius: 10 }}>
              <Icon name={o.icon} size={20} />
            </span>
            <span className="headline">{o.busy ? 'Генерируем…' : o.title}</span>
            <span className="footnote">{o.text}</span>
          </button>
        ))}
      </div>
    </section>
  )
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  )
}

function ClientSheet({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const { refresh } = useSession()
  const [form, setForm] = useState({ name: '', code: '', kind: 'individual' as 'individual' | 'legal', country: 'KZ', city: '', bank: '', tax_id: '', is_pep: false })
  const [error, setError] = useState<string | null>(null)
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }))

  const create = useMutation({
    mutationFn: () => api.createAccount({ ...form, code: form.code.trim() || undefined }),
    onSuccess: (acc) => {
      qc.invalidateQueries({ queryKey: ['accounts'] })
      refresh()
      toast({ title: 'Клиент добавлен', text: `${acc.name} · ${acc.code}`, icon: 'person', color: 'var(--blue)' })
      onClose()
    },
    onError: (e) => setError(errorText(e)),
  })

  const submit = (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    create.mutate()
  }

  return (
    <Sheet title="Новый клиент" onClose={onClose} narrow>
      <form className="stack" style={{ gap: 16 }} onSubmit={submit}>
        <SegmentedControl
          label="Тип клиента"
          value={form.kind}
          onChange={(v) => set('kind', v)}
          options={[
            { value: 'individual', label: 'Физлицо' },
            { value: 'legal', label: 'Юрлицо' },
          ]}
        />
        <div className="list-group">
          <Field label={form.kind === 'legal' ? 'Наименование' : 'ФИО'}>
            <input required minLength={2} maxLength={200} value={form.name} onChange={(e) => set('name', e.target.value)} placeholder={form.kind === 'legal' ? 'ТОО «Альфа Трейд»' : 'Иванов Пётр'} autoFocus />
          </Field>
          <Field label="Код клиента" hint="Как в вашей системе. Пусто — сгенерируем.">
            <input value={form.code} maxLength={64} pattern="[\w\-.]+" onChange={(e) => set('code', e.target.value)} placeholder="CL-00001" />
          </Field>
          <Field label="ИИН / БИН">
            <input value={form.tax_id} inputMode="numeric" pattern="\d{0,12}" maxLength={12} onChange={(e) => set('tax_id', e.target.value)} placeholder="12 цифр" />
          </Field>
          <Field label="Страна">
            <select value={form.country} onChange={(e) => set('country', e.target.value)}>
              {Object.entries(COUNTRY).map(([code, name]) => (
                <option key={code} value={code}>
                  {name} ({code})
                </option>
              ))}
            </select>
          </Field>
          <Field label="Город">
            <input value={form.city} maxLength={80} onChange={(e) => set('city', e.target.value)} placeholder="Астана" />
          </Field>
          <Field label="Банк">
            <input value={form.bank} maxLength={100} onChange={(e) => set('bank', e.target.value)} placeholder="Банк клиента" />
          </Field>
          <div className="list-row">
            <span>Публичное должностное лицо</span>
            <span style={{ marginLeft: 'auto' }}>
              <Switch label="ПДЛ" checked={form.is_pep} onChange={(v) => set('is_pep', v)} />
            </span>
          </div>
        </div>
        {error && <div className="auth__error">{error}</div>}
        <button type="submit" className="btn btn--filled btn--large" disabled={create.isPending}>
          {create.isPending ? 'Сохраняем…' : 'Добавить клиента'}
        </button>
      </form>
    </Sheet>
  )
}

function TransactionSheet({ accounts, onClose }: { accounts: Account[]; onClose: () => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const navigate = useNavigate()
  const [form, setForm] = useState({
    sender_id: accounts[0]?.code ?? '',
    receiver_id: accounts[1]?.code ?? '',
    amount: '',
    channel: 'transfer' as Channel,
    purpose: '',
  })
  const [error, setError] = useState<string | null>(null)
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }))
  const receiver = accounts.find((a) => a.code === form.receiver_id)

  const create = useMutation({
    mutationFn: () =>
      api.createTransaction({
        sender_id: form.sender_id,
        receiver_id: form.receiver_id,
        amount: Number(form.amount.replace(/\s/g, '').replace(',', '.')),
        channel: form.channel,
        country: receiver?.country ?? 'KZ',
        purpose: form.purpose,
      }),
    onSuccess: (res) => {
      qc.invalidateQueries()
      const score = res.risk_score ?? 0
      const flagged = score >= 65
      toast({
        title: flagged ? `Риск ${score}/100 — создан алерт` : `Операция принята · риск ${score}/100`,
        text: flagged ? 'Нажмите, чтобы открыть очередь алертов' : 'Признаков для кейса нет',
        icon: flagged ? 'alert' : 'checkCircle',
        color: flagged ? 'var(--red)' : 'var(--green)',
        onClick: flagged ? () => navigate('/app/alerts') : undefined,
      })
      onClose()
    },
    onError: (e) => setError(errorText(e)),
  })

  const submit = (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (form.sender_id === form.receiver_id) return setError('Отправитель и получатель должны различаться')
    create.mutate()
  }

  const options = accounts.map((a) => (
    <option key={a.id} value={a.code}>
      {a.name} · {a.code}
      {a.country !== 'KZ' ? ` · ${a.country}` : ''}
    </option>
  ))

  return (
    <Sheet title="Новая операция" onClose={onClose} narrow>
      <form className="stack" style={{ gap: 16 }} onSubmit={submit}>
        <div className="list-group">
          <Field label="Отправитель">
            <select value={form.sender_id} onChange={(e) => set('sender_id', e.target.value)}>
              {options}
            </select>
          </Field>
          <Field label="Получатель">
            <select value={form.receiver_id} onChange={(e) => set('receiver_id', e.target.value)}>
              {options}
            </select>
          </Field>
          <Field label="Сумма, ₸">
            <input required inputMode="decimal" pattern="[\d\s.,]+" value={form.amount} onChange={(e) => set('amount', e.target.value)} placeholder="6 900 000" autoFocus />
          </Field>
          <Field label="Канал">
            <select value={form.channel} onChange={(e) => set('channel', e.target.value as Channel)}>
              {Object.entries(CHANNEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Назначение">
            <input value={form.purpose} maxLength={200} onChange={(e) => set('purpose', e.target.value)} placeholder="Оплата по договору" />
          </Field>
        </div>
        <p className="footnote" style={{ margin: 0 }}>
          Подсказка: несколько операций одного клиента на 6–7 млн ₸ подряд — это «дробление». Перевод в офшор (VG, PA, SC, KY)
          тоже повышает риск.
        </p>
        {error && <div className="auth__error">{error}</div>}
        <button type="submit" className="btn btn--filled btn--large" disabled={create.isPending}>
          {create.isPending ? 'Оцениваем риск…' : 'Провести и оценить'}
        </button>
      </form>
    </Sheet>
  )
}

function ImportSheet({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const { refresh } = useSession()
  const input = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [drag, setDrag] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const upload = useMutation({
    mutationFn: (f: File) => api.importCsv(f),
    onSuccess: (r) => {
      setResult(r)
      qc.invalidateQueries()
      refresh()
    },
    onError: (e) => setError(errorText(e)),
  })

  const pick = (f: File | undefined) => {
    if (!f) return
    setFile(f)
    setResult(null)
    setError(null)
    upload.mutate(f)
  }

  return (
    <Sheet title="Импорт операций из CSV" onClose={onClose} narrow>
      <div
        className={`dropzone ${drag ? 'is-drag' : ''}`}
        onDragOver={(e) => {
          e.preventDefault()
          setDrag(true)
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDrag(false)
          pick(e.dataTransfer.files[0])
        }}
        onClick={() => input.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && input.current?.click()}
      >
        <Icon name="doc" size={34} strokeWidth={1.4} />
        <span className="headline">{upload.isPending ? 'Загружаем и оцениваем…' : file ? file.name : 'Перетащите CSV или нажмите'}</span>
        <span className="footnote">До 2 МБ и 2000 строк. Разделитель — запятая или точка с запятой.</span>
        <input ref={input} type="file" accept=".csv,text/csv" hidden onChange={(e) => pick(e.target.files?.[0] ?? undefined)} />
      </div>

      <div className="list-group">
        <a className="list-row" href={IMPORT_TEMPLATE_URL} download>
          <Icon name="doc" size={16} style={{ color: 'var(--accent)' }} />
          <span>Скачать шаблон CSV</span>
          <Icon name="chevronRight" size={13} className="list-row__chevron" style={{ marginLeft: 'auto' }} />
        </a>
        <div className="list-row footnote" style={{ display: 'block' }}>
          Колонки: <span className="mono">sender_code, sender_name, receiver_code, receiver_name, receiver_country, amount, channel</span> и
          необязательные <span className="mono">ts, external_id, purpose</span>. Повторная загрузка с тем же external_id не создаст дублей.
        </div>
      </div>

      {error && <div className="auth__error">{error}</div>}
      {result && (
        <div className="stack" style={{ gap: 12 }}>
          <div className="import-stats">
            <Stat value={result.imported} label="импортировано" color="var(--green)" />
            <Stat value={result.alerts} label="алертов" color="var(--red)" />
            <Stat value={result.created_clients} label="новых клиентов" color="var(--blue)" />
            <Stat value={result.duplicates} label="дублей" color="var(--gray)" />
          </div>
          {result.errors.length > 0 && (
            <div>
              <div className="list-group__title">Ошибки · {result.errors.length}</div>
              <div className="list-group" style={{ maxHeight: 200, overflowY: 'auto' }}>
                {result.errors.map((e) => (
                  <div key={e.row} className="list-row footnote">
                    <span className="mono" style={{ color: 'var(--red)' }}>
                      строка {e.row}
                    </span>
                    <span>{e.message}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <button type="button" className="btn btn--filled btn--large" onClick={onClose}>
            Готово
          </button>
        </div>
      )}
    </Sheet>
  )
}

function Stat({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <div className="import-stat">
      <b style={{ color }}>{value}</b>
      <span className="caption">{label}</span>
    </div>
  )
}
