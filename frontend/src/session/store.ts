/**
 * Credentials used by the API layer. Kept outside React so `request()`, the WebSocket
 * and EventSource URLs can read them without hooks; the SessionProvider keeps it in sync.
 */
export interface AuthState {
  token: string | null
  workspaceId: number | null
}

const KEY = 'vigil.session'
export const DEMO_WORKSPACE_ID = 1

function load(): AuthState {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}')
    return { token: raw.token ?? null, workspaceId: raw.workspaceId ?? null }
  } catch {
    return { token: null, workspaceId: null }
  }
}

let state: AuthState = load()

export const getAuth = (): AuthState => state

export function setAuth(patch: Partial<AuthState>) {
  state = { ...state, ...patch }
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    /* storage may be unavailable */
  }
}

export function authHeaders(): Record<string, string> {
  const h: Record<string, string> = {}
  if (state.token) h.Authorization = `Bearer ${state.token}`
  if (state.workspaceId !== null) h['X-Workspace-Id'] = String(state.workspaceId)
  return h
}

/** Query string for EventSource / WebSocket, which cannot send headers. */
export function authQuery(): string {
  const q = new URLSearchParams()
  if (state.workspaceId !== null) q.set('workspace', String(state.workspaceId))
  if (state.token) q.set('token', state.token)
  const s = q.toString()
  return s ? `?${s}` : ''
}
