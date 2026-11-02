import { useEffect, useRef, useState, type ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { useStats } from '../api/queries'
import { useLive } from '../live/LiveProvider'
import { useSession } from '../session/SessionProvider'
import { Avatar } from './badges'
import { Icon, type IconName } from './Icon'
import { WorkspaceSwitcher } from './WorkspaceSwitcher'

interface NavEntry {
  to: string
  label: string
  short: string
  icon: IconName
  badge?: 'alerts'
}

export const NAV: { section: string; items: NavEntry[] }[] = [
  {
    section: 'Мониторинг',
    items: [
      { to: '/app', label: 'Обзор', short: 'Обзор', icon: 'grid' },
      { to: '/app/live', label: 'Live-лента', short: 'Live', icon: 'waveform' },
      { to: '/app/alerts', label: 'Алерты', short: 'Алерты', icon: 'alert', badge: 'alerts' },
      { to: '/app/clients', label: 'Клиенты', short: 'Клиенты', icon: 'people' },
    ],
  },
  { section: 'Инструменты', items: [{ to: '/app/analyst', label: 'AI-аналитик', short: 'AI', icon: 'sparkles' }] },
  { section: 'Система', items: [{ to: '/app/settings', label: 'Настройки', short: 'Настройки', icon: 'gear' }] },
]

export function LivePill() {
  const { status, latency, paused, rate } = useLive()
  const label =
    paused ? 'Пауза' : status === 'open' ? `Live · ${rate}/мин` : status === 'closed' ? 'Нет связи' : 'Подключение…'
  return (
    <span className="live-pill" data-status={paused ? 'paused' : status} title={latency !== null ? `Задержка ${latency} мс` : undefined}>
      <span className="live-pill__dot" />
      {label}
      {status === 'open' && latency !== null && !paused && <span className="tertiary">{latency} мс</span>}
    </span>
  )
}

export function Sidebar({ onSearch }: { onSearch: () => void }) {
  const { data: stats } = useStats()
  const { user } = useSession()
  return (
    <aside className="sidebar" aria-label="Навигация">
      <div className="sidebar__brand">
        <span className="app-icon">
          <Icon name="shield" size={20} strokeWidth={2.2} />
        </span>
        <div>
          <div className="sidebar__name">Vigil</div>
          <div className="sidebar__tag">AML Monitoring</div>
        </div>
      </div>
      <WorkspaceSwitcher />
      <button type="button" className="sidebar__search" onClick={onSearch}>
        <Icon name="search" size={15} />
        Поиск и команды
        <kbd>⌘K</kbd>
      </button>
      <nav>
        {NAV.map((group) => (
          <div key={group.section}>
            <div className="sidebar__section">{group.section}</div>
            {group.items.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.to === '/app'} className="nav-item">
                <Icon name={item.icon} size={18} />
                {item.label}
                {item.badge && stats ? <span className="nav-item__badge">{stats.open_alerts}</span> : null}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>
      <div className="sidebar__footer">
        <LivePill />
        <div className="user-chip">
          <Avatar name={user?.name ?? 'Гость'} size={30} />
          <div style={{ minWidth: 0 }}>
            <div className="headline truncate" style={{ fontSize: 13.5 }}>{user?.name ?? 'Гость'}</div>
            <div className="caption truncate">{user?.email ?? 'Без входа · демо'}</div>
          </div>
        </div>
      </div>
    </aside>
  )
}

export function TabBar() {
  const { data: stats } = useStats()
  return (
    <nav className="tabbar" aria-label="Разделы">
      {NAV.flatMap((g) => g.items).map((item) => (
        <NavLink key={item.to} to={item.to} end={item.to === '/app'}>
          <Icon name={item.icon} size={24} strokeWidth={1.7} />
          {item.short}
          {item.badge && stats && stats.critical_alerts > 0 ? <span className="tabbar__dot">{stats.critical_alerts}</span> : null}
        </NavLink>
      ))}
    </nav>
  )
}

/** Page scaffold: sticky translucent navigation bar that reveals an inline title once the large title scrolls away. */
export function Page({
  title,
  subtitle,
  actions,
  barActions,
  children,
}: {
  title: string
  subtitle?: ReactNode
  actions?: ReactNode
  barActions?: ReactNode
  children: ReactNode
}) {
  const sentinel = useRef<HTMLDivElement>(null)
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    document.title = `${title} · Vigil`
    if (!sentinel.current || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(([e]) => setScrolled(!e?.isIntersecting), { rootMargin: '-52px 0px 0px 0px' })
    io.observe(sentinel.current)
    return () => io.disconnect()
  }, [title])

  return (
    <>
      <header className={`navbar ${scrolled ? 'scrolled' : ''}`}>
        <span className="navbar__title">{title}</span>
        <div className="navbar__actions">{barActions}</div>
      </header>
      <div className="page-header">
        <div>
          <h1 className="large-title">{title}</h1>
          {subtitle && <p className="subhead">{subtitle}</p>}
        </div>
        {actions && <div className="toolbar">{actions}</div>}
      </div>
      <div ref={sentinel} aria-hidden="true" />
      <div className="page">{children}</div>
    </>
  )
}

export function Empty({ icon, title, text }: { icon: IconName; title: string; text?: string }) {
  return (
    <div className="empty">
      <Icon name={icon} size={40} strokeWidth={1.4} />
      <div className="headline">{title}</div>
      {text && <div className="footnote">{text}</div>}
    </div>
  )
}
