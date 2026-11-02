import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { useAlerts } from '../api/queries'
import { formatKZT } from '../lib/format'
import { usePrefs } from '../theme/PrefsProvider'
import { Icon, type IconName } from './Icon'
import { NAV } from './Layout'

interface Command {
  id: string
  group: string
  label: string
  hint?: string
  icon: IconName
  color: string
  run: () => void
}

/** Spotlight-style palette: pages, actions and alert search. Opens with ⌘K / Ctrl+K. */
export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [q, setQ] = useState('')
  const [index, setIndex] = useState(0)
  const navigate = useNavigate()
  const { prefs, setPref } = usePrefs()
  const listRef = useRef<HTMLDivElement>(null)
  const { data } = useAlerts({ q: q.trim().length >= 2 ? q.trim() : undefined })

  const commands = useMemo<Command[]>(() => {
    const go = (to: string) => () => navigate(to)
    const pages: Command[] = NAV.flatMap((g) => g.items).map((i) => ({
      id: `page:${i.to}`,
      group: 'Разделы',
      label: i.label,
      icon: i.icon,
      color: 'var(--blue)',
      run: go(i.to),
    }))
    const actions: Command[] = [
      {
        id: 'theme',
        group: 'Действия',
        label: prefs.appearance === 'dark' ? 'Светлая тема' : 'Тёмная тема',
        icon: prefs.appearance === 'dark' ? 'sun' : 'moon',
        color: 'var(--indigo)',
        run: () => setPref('appearance', prefs.appearance === 'dark' ? 'light' : 'dark'),
      },
      { id: 'ask', group: 'Действия', label: 'Спросить AI-аналитика', icon: 'sparkles', color: 'var(--purple)', run: go('/app/analyst') },
      { id: 'docs', group: 'Действия', label: 'Открыть документацию API', hint: 'Swagger UI', icon: 'doc', color: 'var(--gray)', run: () => window.open('/api/docs', '_blank') },
    ]
    const needle = q.trim().toLowerCase()
    const match = (c: Command) => !needle || c.label.toLowerCase().includes(needle)
    const alerts: Command[] =
      needle.length >= 2
        ? (data?.items ?? []).slice(0, 6).map((a) => ({
            id: `alert:${a.id}`,
            group: 'Алерты',
            label: `#${a.id} · ${a.account.name}`,
            hint: `${a.typology} · ${formatKZT(a.transaction.amount, { compact: true })}`,
            icon: 'alert' as const,
            color: 'var(--red)',
            run: go(`/app/alerts/${a.id}`),
          }))
        : []
    return [...pages.filter(match), ...actions.filter(match), ...alerts]
  }, [q, data, navigate, prefs.appearance, setPref])

  useEffect(() => setIndex(0), [q])
  useEffect(() => {
    if (!open) setQ('')
  }, [open])
  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [index])

  if (!open) return null

  const run = (c?: Command) => {
    if (!c) return
    c.run()
    onClose()
  }

  let lastGroup = ''
  return createPortal(
    <div className="backdrop palette-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="palette" role="dialog" aria-modal="true" aria-label="Поиск и команды">
        <div className="palette__input">
          <Icon name="search" size={22} />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Раздел, действие или #номер алерта"
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-list"
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setIndex((i) => Math.min(commands.length - 1, i + 1))
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setIndex((i) => Math.max(0, i - 1))
              } else if (e.key === 'Enter') run(commands[index])
              else if (e.key === 'Escape') onClose()
            }}
          />
          <kbd>esc</kbd>
        </div>
        <div className="palette__list" id="palette-list" role="listbox" ref={listRef}>
          {commands.length === 0 && <div className="empty">Ничего не найдено</div>}
          {commands.map((c, i) => {
            const header = c.group !== lastGroup ? <div className="palette__group">{c.group}</div> : null
            lastGroup = c.group
            return (
              <div key={c.id}>
                {header}
                <button
                  type="button"
                  role="option"
                  aria-selected={i === index}
                  className="palette__item"
                  onMouseMove={() => setIndex(i)}
                  onClick={() => run(c)}
                >
                  <span className="row-icon" style={{ ['--c' as string]: c.color, width: 26, height: 26, borderRadius: 7 }}>
                    <Icon name={c.icon} size={15} />
                  </span>
                  <span className="truncate">{c.label}</span>
                  {c.hint && <span className="secondary truncate" style={{ marginLeft: 'auto', fontSize: 13 }}>{c.hint}</span>}
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </div>,
    document.body,
  )
}
