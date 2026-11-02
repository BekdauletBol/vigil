import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { ToastProvider } from '../components/Toasts'
import { alert, page } from '../test/fixtures'
import { PrefsProvider } from '../theme/PrefsProvider'
import { AlertsPage } from './AlertsPage'

function renderAt(path: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <PrefsProvider>
        <ToastProvider>
          <MemoryRouter initialEntries={[path]}>
            <Routes>
              <Route path="/alerts" element={<AlertsPage />} />
              <Route path="/alerts/:id" element={<AlertsPage />} />
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      </PrefsProvider>
    </QueryClientProvider>,
  )
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

describe('AlertsPage', () => {
  let fetchMock: MockInstance<typeof fetch>

  beforeEach(() => {
    fetchMock = vi.spyOn(globalThis, 'fetch')
  })
  afterEach(() => vi.restoreAllMocks())

  it('lists alerts from the API with the status filter in the query', async () => {
    fetchMock.mockResolvedValue(json(page([alert({ id: 7, account: { ...alert().account, name: 'ТОО «Сункар Логистик»' } })])))
    renderAt('/alerts')
    expect(await screen.findByText('ТОО «Сункар Логистик»')).toBeInTheDocument()
    expect(String(fetchMock.mock.calls[0]![0])).toContain('status=open')
  })

  it('opens the case sheet and rolls back an optimistic update rejected by the server', async () => {
    const detail = {
      ...alert({ id: 7 }),
      account: { ...alert().account, tax_id: '1234••••56', city: 'Астана', risk_level: 'low', is_pep: false, opened_at: '2020-01-01T00:00:00Z' },
      notes: [],
      related: [],
      graph_nodes: [],
      graph_edges: [],
    }
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (init?.method === 'PATCH') return json({ detail: 'Переход запрещён' }, 409)
      if (url.includes('/alerts/7')) return json(detail)
      return json(page([alert({ id: 7 })]))
    })

    renderAt('/alerts/7')
    const dialog = await screen.findByRole('dialog')
    const takeButton = await within(dialog).findByRole('button', { name: /Взять в работу/ })
    await userEvent.click(takeButton)

    expect(await screen.findByText('Не удалось изменить статус')).toBeInTheDocument()
    expect(screen.getByText('Переход запрещён')).toBeInTheDocument()
    await waitFor(() => expect(within(dialog).getAllByText('Открыт').length).toBeGreaterThan(0))
  })
})
