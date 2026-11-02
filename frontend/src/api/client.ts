import { authHeaders } from '../session/store'
import type {
  Account,
  AccountInput,
  Alert,
  AlertDetail,
  AlertFilters,
  AlertNote,
  AlertPage,
  AlertStatus,
  AuthResponse,
  ImportResult,
  Stats,
  TransactionInput,
  Workspace,
} from './types'

export const API_BASE = import.meta.env.VITE_API_BASE ?? '/api/v1'

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

/** Typed fetch wrapper: JSON in/out, FastAPI error bodies turned into ApiError. */
export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(typeof init.body === 'string' ? { 'Content-Type': 'application/json' } : {}),
      ...authHeaders(),
      ...init.headers,
    },
  })
  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`
    try {
      const body = await res.json()
      if (typeof body.detail === 'string') message = body.detail
      else if (Array.isArray(body.detail)) message = body.detail.map((d: { msg: string }) => d.msg).join('; ')
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, message)
  }
  return res.status === 204 ? (undefined as T) : res.json()
}

function query(params: Record<string, string | number | undefined>) {
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') qs.set(k, String(v))
  const s = qs.toString()
  return s ? `?${s}` : ''
}

export const api = {
  stats: (minutes = 60) => request<Stats>(`/stats${query({ minutes })}`),
  alerts: (f: AlertFilters & { limit?: number } = {}) => request<AlertPage>(`/alerts${query({ ...f })}`),
  alert: (id: number) => request<AlertDetail>(`/alerts/${id}`),
  updateAlert: (id: number, patch: { status?: AlertStatus; assignee?: string | null; author?: string }) =>
    request<Alert>(`/alerts/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  addNote: (id: number, text: string, author: string) =>
    request<AlertNote>(`/alerts/${id}/notes`, { method: 'POST', body: JSON.stringify({ text, author }) }),
  ready: () => request<{ status: string; checks: Record<string, boolean> }>('/health/ready'),

  register: (body: { email: string; password: string; name: string }) =>
    request<AuthResponse>('/auth/register', { method: 'POST', body: JSON.stringify(body) }),
  login: (body: { email: string; password: string }) =>
    request<AuthResponse>('/auth/login', { method: 'POST', body: JSON.stringify(body) }),
  me: () => request<AuthResponse>('/auth/me'),

  workspaces: () => request<Workspace[]>('/workspaces'),
  createWorkspace: (name: string) => request<Workspace>('/workspaces', { method: 'POST', body: JSON.stringify({ name }) }),
  updateWorkspace: (id: number, patch: { name?: string; simulator?: boolean }) =>
    request<Workspace>(`/workspaces/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  rotateApiKey: (id: number) => request<{ api_key: string; prefix: string }>(`/workspaces/${id}/api-key`, { method: 'POST' }),
  sampleData: (id: number) => request<Workspace>(`/workspaces/${id}/sample-data`, { method: 'POST' }),
  resetData: (id: number) => request<Workspace>(`/workspaces/${id}/data`, { method: 'DELETE' }),

  accounts: (q?: string) => request<Account[]>(`/accounts${query({ q, limit: 1000 })}`),
  createAccount: (body: AccountInput) => request<Account>('/accounts', { method: 'POST', body: JSON.stringify(body) }),
  createTransaction: (body: TransactionInput) =>
    request<{ id: string; status: string; risk_score: number | null }>('/transactions?wait=true', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  importCsv: (file: File) => {
    const form = new FormData()
    form.append('file', file)
    return request<ImportResult>('/transactions/import', { method: 'POST', body: form })
  },
}

export const IMPORT_TEMPLATE_URL = `${API_BASE}/transactions/import/template`
