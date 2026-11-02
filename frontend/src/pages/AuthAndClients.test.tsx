import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../components/Toasts'
import { SessionProvider } from '../session/SessionProvider'
import { getAuth, setAuth } from '../session/store'
import { PrefsProvider } from '../theme/PrefsProvider'
import { AuthPage } from './AuthPage'
import { ClientsPage } from './ClientsPage'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const demo = { id: 1, name: 'Демо-банк', kind: 'demo', api_key_prefix: null, simulator_until: null, created_at: '2026-01-01T00:00:00Z', accounts: 80, transactions: 4000 }
const mine = { ...demo, id: 5, name: 'Пространство Bek', kind: 'private', accounts: 0, transactions: 0 }

function wrap(path: string, routes: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <PrefsProvider>
        <MemoryRouter initialEntries={[path]}>
          <ToastProvider>
            <SessionProvider>
              <Routes>{routes}</Routes>
            </SessionProvider>
          </ToastProvider>
        </MemoryRouter>
      </PrefsProvider>
    </QueryClientProvider>,
  )
}

describe('registration', () => {
  beforeEach(() => setAuth({ token: null, workspaceId: null }))
  afterEach(() => vi.restoreAllMocks())

  it('shows the server error, then registers and opens the private workspace', async () => {
    let attempts = 0
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith('/auth/register')) {
        attempts += 1
        return attempts === 1
          ? json({ detail: 'Пользователь с таким email уже есть' }, 409)
          : json({ token: 'jwt', user: { id: 1, email: 'b@x.kz', name: 'Bek' }, workspaces: [demo, mine] }, 201)
      }
      if (url.includes('/workspaces')) return json([demo])
      return json([])
    })

    wrap('/register', (
      <>
        <Route path="/register" element={<AuthPage mode="register" />} />
        <Route path="/app/clients" element={<div>clients-page</div>} />
      </>
    ))

    await userEvent.type(screen.getByPlaceholderText('Бекдаулет'), 'Bek')
    await userEvent.type(screen.getByPlaceholderText('you@example.com'), 'b@x.kz')
    await userEvent.type(screen.getByPlaceholderText('Минимум 8 символов'), 'password1')
    await userEvent.click(screen.getByRole('button', { name: 'Создать аккаунт' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('уже есть')

    await userEvent.click(screen.getByRole('button', { name: 'Создать аккаунт' }))
    expect(await screen.findByText('clients-page')).toBeInTheDocument()
    expect(getAuth()).toEqual({ token: 'jwt', workspaceId: 5 })
  })
})

describe('ClientsPage', () => {
  afterEach(() => vi.restoreAllMocks())

  it('offers onboarding in an empty workspace and sends the workspace header', async () => {
    setAuth({ token: 'jwt', workspaceId: 5 })
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith('/auth/me')) return json({ token: 'jwt', user: { id: 1, email: 'b@x.kz', name: 'Bek' }, workspaces: [demo, mine] })
      return json([])
    })

    wrap('/app/clients', <Route path="/app/clients" element={<ClientsPage />} />)
    expect(await screen.findByText('С чего начать')).toBeInTheDocument()
    expect(screen.getByText('Сгенерировать тестовые данные')).toBeInTheDocument()

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([u]) => String(u).includes('/accounts'))
      expect(call).toBeTruthy()
      const headers = call![1]!.headers as Record<string, string>
      expect(headers['X-Workspace-Id']).toBe('5')
      expect(headers.Authorization).toBe('Bearer jwt')
    })
  })
})
