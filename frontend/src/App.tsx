import { useEffect, useState } from 'react'
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import type { Alert } from './api/types'
import { CommandPalette } from './components/CommandPalette'
import { Sidebar, TabBar } from './components/Layout'
import { useToast } from './components/Toasts'
import { formatKZT } from './lib/format'
import { SEVERITY } from './lib/labels'
import { useServerEvents } from './live/useServerEvents'
import { AlertsPage } from './pages/AlertsPage'
import { AnalystPage } from './pages/AnalystPage'
import { LivePage } from './pages/LivePage'
import { OverviewPage } from './pages/OverviewPage'
import { SettingsPage } from './pages/SettingsPage'
import { usePrefs } from './theme/PrefsProvider'

export function App() {
  const [paletteOpen, setPaletteOpen] = useState(false)
  const toast = useToast()
  const navigate = useNavigate()
  const { prefs } = usePrefs()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen((o) => !o)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useServerEvents((alert: Alert) => {
    if (!prefs.notifications || (alert.severity !== 'critical' && alert.severity !== 'high')) return
    toast({
      title: `Новый алерт #${alert.id} · ${SEVERITY[alert.severity]}`,
      text: `${alert.account.name} — ${alert.typology}, ${formatKZT(alert.transaction.amount, { compact: true })}`,
      icon: 'alert',
      color: alert.severity === 'critical' ? 'var(--pink)' : 'var(--red)',
      onClick: () => navigate(`/alerts/${alert.id}`),
    })
  })

  return (
    <div className="app">
      <Sidebar onSearch={() => setPaletteOpen(true)} />
      <main className="main">
        <Routes>
          <Route path="/" element={<OverviewPage />} />
          <Route path="/live" element={<LivePage />} />
          <Route path="/alerts" element={<AlertsPage />} />
          <Route path="/alerts/:id" element={<AlertsPage />} />
          <Route path="/analyst" element={<AnalystPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <TabBar />
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  )
}
