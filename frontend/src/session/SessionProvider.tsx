import { useQueryClient } from '@tanstack/react-query'
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api, ApiError } from '../api/client'
import type { AuthResponse, User, Workspace } from '../api/types'
import { DEMO_WORKSPACE_ID, getAuth, setAuth } from './store'

interface SessionCtx {
  user: User | null
  workspaces: Workspace[]
  workspace: Workspace | null
  workspaceId: number | null
  ready: boolean
  isDemo: boolean
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string, name: string) => Promise<void>
  logout: () => void
  selectWorkspace: (id: number) => void
  enterDemo: () => void
  refresh: () => Promise<void>
}

const Ctx = createContext<SessionCtx | null>(null)

export function SessionProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient()
  const [user, setUser] = useState<User | null>(null)
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [workspaceId, setWorkspaceId] = useState<number | null>(getAuth().workspaceId)
  const [ready, setReady] = useState(false)

  const apply = useCallback((res: AuthResponse, preferPrivate: boolean) => {
    setAuth({ token: res.token })
    setUser(res.user)
    setWorkspaces(res.workspaces)
    const current = getAuth().workspaceId
    const own = res.workspaces.find((w) => w.kind === 'private')
    const keep = res.workspaces.some((w) => w.id === current)
    const next = preferPrivate && own ? own.id : keep ? current : (own?.id ?? DEMO_WORKSPACE_ID)
    setAuth({ workspaceId: next })
    setWorkspaceId(next)
  }, [])

  const refresh = useCallback(async () => {
    if (getAuth().token) {
      try {
        apply(await api.me(), false)
        return
      } catch (e) {
        if (!(e instanceof ApiError && e.status === 401)) throw e
        setAuth({ token: null, workspaceId: DEMO_WORKSPACE_ID }) // expired token
        setWorkspaceId(DEMO_WORKSPACE_ID)
        setUser(null)
      }
    }
    setWorkspaces(await api.workspaces())
  }, [apply])

  useEffect(() => {
    refresh()
      .catch(() => undefined)
      .finally(() => setReady(true))
  }, [refresh])

  const selectWorkspace = useCallback(
    (id: number) => {
      if (id === getAuth().workspaceId) return
      setAuth({ workspaceId: id })
      setWorkspaceId(id)
      qc.clear() // cached data belongs to the previous workspace
    },
    [qc],
  )

  const value = useMemo<SessionCtx>(() => {
    const workspace = workspaces.find((w) => w.id === workspaceId) ?? null
    return {
      user,
      workspaces,
      workspace,
      workspaceId,
      ready,
      isDemo: workspace?.kind === 'demo' || workspaceId === DEMO_WORKSPACE_ID,
      login: async (email, password) => {
        apply(await api.login({ email, password }), true)
        qc.clear()
      },
      register: async (email, password, name) => {
        apply(await api.register({ email, password, name }), true)
        qc.clear()
      },
      logout: () => {
        setAuth({ token: null, workspaceId: null })
        setUser(null)
        setWorkspaceId(null)
        qc.clear()
        api.workspaces().then(setWorkspaces).catch(() => undefined)
      },
      selectWorkspace,
      enterDemo: () => selectWorkspace(DEMO_WORKSPACE_ID),
      refresh,
    }
  }, [user, workspaces, workspaceId, ready, apply, qc, selectWorkspace, refresh])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useSession() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useSession must be used inside <SessionProvider>')
  return ctx
}
