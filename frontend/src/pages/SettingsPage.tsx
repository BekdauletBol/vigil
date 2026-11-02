import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'
import { SegmentedControl, Switch } from '../components/controls'
import { Icon, type IconName } from '../components/Icon'
import { Page } from '../components/Layout'
import { ACCENTS, usePrefs, type Appearance } from '../theme/PrefsProvider'

function IconRow({ icon, color, label, children }: { icon: IconName; color: string; label: string; children: React.ReactNode }) {
  return (
    <div className="list-row list-row--icon">
      <span className="row-icon" style={{ ['--c' as string]: color }}>
        <Icon name={icon} size={17} />
      </span>
      <span>{label}</span>
      <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center' }}>{children}</span>
    </div>
  )
}

export function SettingsPage() {
  const { prefs, setPref } = usePrefs()
  const ready = useQuery({ queryKey: ['ready'], queryFn: api.ready, refetchInterval: 10_000, retry: false })

  return (
    <Page title="Настройки">
      <div className="settings">
        <section>
          <div className="list-group__title">Оформление</div>
          <div className="list-group">
            <IconRow icon="moon" color="var(--indigo)" label="Тема">
              <SegmentedControl<Appearance>
                label="Тема"
                value={prefs.appearance}
                onChange={(v) => setPref('appearance', v)}
                options={[
                  { value: 'system', label: 'Авто' },
                  { value: 'light', label: 'Светлая' },
                  { value: 'dark', label: 'Тёмная' },
                ]}
              />
            </IconRow>
            <IconRow icon="sparkles" color="var(--accent)" label="Акцент">
              <div className="accent-dots" role="radiogroup" aria-label="Акцентный цвет">
                {ACCENTS.map((a) => (
                  <button
                    key={a}
                    type="button"
                    role="radio"
                    aria-checked={prefs.accent === a}
                    aria-label={a}
                    className="accent-dot"
                    style={{ ['--c' as string]: `var(--${a})` }}
                    onClick={() => setPref('accent', a)}
                  />
                ))}
              </div>
            </IconRow>
            <IconRow icon="eye" color="var(--teal)" label="Уменьшить движение">
              <Switch label="Уменьшить движение" checked={prefs.reduceMotion} onChange={(v) => setPref('reduceMotion', v)} />
            </IconRow>
          </div>
        </section>

        <section>
          <div className="list-group__title">Работа</div>
          <div className="list-group">
            <IconRow icon="bell" color="var(--red)" label="Уведомления о новых алертах">
              <Switch label="Уведомления" checked={prefs.notifications} onChange={(v) => setPref('notifications', v)} />
            </IconRow>
            <IconRow icon="person" color="var(--blue)" label="Имя аналитика">
              <input
                value={prefs.analystName}
                onChange={(e) => setPref('analystName', e.target.value.slice(0, 40) || 'Аналитик')}
                aria-label="Имя аналитика"
                style={{ border: 0, background: 'none', textAlign: 'right', outline: 'none', color: 'var(--label-2)', width: 180 }}
              />
            </IconRow>
          </div>
          <div className="list-group__footer">Имя записывается в журнал аудита при смене статуса кейса.</div>
        </section>

        <section>
          <div className="list-group__title">Система</div>
          <div className="list-group">
            <IconRow icon="cpu" color="var(--green)" label="База данных (PostgreSQL)">
              <Status ok={ready.data?.checks.database} loading={ready.isLoading} />
            </IconRow>
            <IconRow icon="bolt" color="var(--orange)" label="Шина событий (Redis)">
              <Status ok={ready.data?.checks.event_bus} loading={ready.isLoading} />
            </IconRow>
            <a className="list-row list-row--icon" href="/api/docs" target="_blank" rel="noreferrer">
              <span className="row-icon" style={{ ['--c' as string]: 'var(--gray)' }}>
                <Icon name="doc" size={17} />
              </span>
              <span style={{ color: 'var(--label)' }}>Документация API (OpenAPI)</span>
              <Icon name="external" size={14} className="list-row__chevron" style={{ marginLeft: 'auto' }} />
            </a>
          </div>
          <div className="list-group__footer">
            Vigil 1.0 · демонстрационный проект. Все клиенты, банки и операции сгенерированы синтетически.
          </div>
        </section>
      </div>
    </Page>
  )
}

function Status({ ok, loading }: { ok?: boolean; loading: boolean }) {
  if (loading) return <span className="footnote">Проверка…</span>
  return (
    <span className="badge" style={{ ['--c' as string]: ok ? 'var(--green)' : 'var(--red)' }}>
      <span className="badge__dot" />
      {ok ? 'Работает' : 'Недоступно'}
    </span>
  )
}
