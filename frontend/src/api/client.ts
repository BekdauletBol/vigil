import type { Alert, AlertDetail, AlertFilters, AlertNote, AlertPage, AlertStatus, Stats } from './types'

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
    headers: { Accept: 'application/json', ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...init.headers },
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
}
