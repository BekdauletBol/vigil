import { useEffect, useState } from 'react'
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import type { Alert } from './api/types'
import { CommandPalette } from './components/CommandPalette'
import { Sidebar, TabBar } from './components/Layout'
import { useToast } from './components/Toasts'
import { DemoBanner } from './components/WorkspaceSwitcher'
import { formatKZT } from './lib/format'
import { SEVERITY } from './lib/labels'
import { LiveProvider } from './live/LiveProvider'
import { useServerEvents } from './live/useServerEvents'
import { AlertsPage } from './pages/AlertsPage'
import { AnalystPage } from './pages/AnalystPage'
import { AuthPage } from './pages/AuthPage'
import { ClientsPage } from './pages/ClientsPage'
import { LandingPage } from './pages/LandingPage'
import { LivePage } from './pages/LivePage'
import { OverviewPage } from './pages/OverviewPage'
import { SettingsPage } from './pages/SettingsPage'
import { useSession } from './session/SessionProvider'
import { usePrefs } from './theme/PrefsProvider'

export function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<AuthPage mode="login" />} />
      <Route path="/register" element={<AuthPage mode="register" />} />
      <Route path="/app/*" element={<AppGate />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

function AppGate() {
  const { ready, workspaceId, enterDemo, user, setAnalystDefault } = useSessionWithPrefs()

  useEffect(() => {
    if (ready && workspaceId === null) enterDemo() // /app opened directly: show the demo
  }, [ready, workspaceId, enterDemo])
  useEffect(() => {
    if (user) setAnalystDefault(user.name)
  }, [user, setAnalystDefault])

  if (!ready || workspaceId === null) return <div className="splash" aria-busy="true" />
  // Remount per workspace: fresh WebSocket/SSE subscriptions and component state.
  return (
    <LiveProvider key={workspaceId}>
      <AppShell workspaceId={workspaceId} />
    </LiveProvider>
  )
}

function useSessionWithPrefs() {
  const session = useSession()
  const { prefs, setPref } = usePrefs()
  return {
    ...session,
    setAnalystDefault: (name: string) => {
      if (prefs.analystName === 'Аналитик') setPref('analystName', name)
    },
  }
}

function AppShell({ workspaceId }: { workspaceId: number }) {
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

  useServerEvents(workspaceId, (alert: Alert) => {
    if (!prefs.notifications || (alert.severity !== 'critical' && alert.severity !== 'high')) return
    toast({
      title: `Новый алерт #${alert.id} · ${SEVERITY[alert.severity]}`,
      text: `${alert.account.name} — ${alert.typology}, ${formatKZT(alert.transaction.amount, { compact: true })}`,
      icon: 'alert',
      color: alert.severity === 'critical' ? 'var(--pink)' : 'var(--red)',
      onClick: () => navigate(`/app/alerts/${alert.id}`),
    })
  })

  return (
    <div className="app">
      <Sidebar onSearch={() => setPaletteOpen(true)} />
      <main className="main">
        <DemoBanner />
        <Routes>
          <Route index element={<OverviewPage />} />
          <Route path="live" element={<LivePage />} />
          <Route path="alerts" element={<AlertsPage />} />
          <Route path="alerts/:id" element={<AlertsPage />} />
          <Route path="clients" element={<ClientsPage />} />
          <Route path="analyst" element={<AnalystPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/app" replace />} />
        </Routes>
      </main>
      <TabBar />
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  )
}
