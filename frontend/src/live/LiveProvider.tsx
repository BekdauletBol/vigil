import { createContext, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react'
import { API_BASE } from '../api/client'
import type { Transaction } from '../api/types'
import { backoffDelay } from '../lib/backoff'
import { authQuery } from '../session/store'
import { LiveStore } from './liveStore'

const LiveContext = createContext<LiveStore | null>(null)

type ServerMessage =
  | { type: 'snapshot'; data: Transaction[] }
  | { type: 'transaction'; data: Transaction }
  | { type: 'pong'; t: number }
  | { type: 'heartbeat' }

function socketUrl() {
  if (/^wss?:/.test(API_BASE)) return `${API_BASE}/ws/transactions${authQuery()}`
  const base = API_BASE.startsWith('http') ? API_BASE.replace(/^http/, 'ws') : `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}${API_BASE}`
  return `${base}/ws/transactions${authQuery()}`
}

/** Owns the single WebSocket connection: reconnects with jittered backoff, measures latency. */
export function LiveProvider({ children }: { children: ReactNode }) {
  const store = useMemo(() => new LiveStore(), [])

  useEffect(() => {
    let ws: WebSocket | null = null
    let attempt = 0
    let disposed = false
    let retryTimer: ReturnType<typeof setTimeout> | undefined
    let pingTimer: ReturnType<typeof setInterval> | undefined

    const connect = () => {
      store.setStatus(attempt === 0 ? 'connecting' : 'reconnecting')
      ws = new WebSocket(socketUrl())

      ws.onopen = () => {
        attempt = 0
        store.setStatus('open')
        pingTimer = setInterval(ping, 10_000)
      }
      // The server sends the snapshot before reading client messages, so the first ping waits for it.
      const ping = () => ws?.readyState === WebSocket.OPEN && ws.send(JSON.stringify({ type: 'ping', t: performance.now() }))
      ws.onmessage = (e) => {
        const msg = JSON.parse(e.data) as ServerMessage
        if (msg.type === 'snapshot') {
          store.setSnapshot(msg.data)
          ping()
        }
        else if (msg.type === 'transaction') store.push(msg.data)
        else if (msg.type === 'pong') store.setLatency(Math.round(performance.now() - msg.t))
      }
      ws.onclose = () => {
        clearInterval(pingTimer)
        if (disposed) return
        store.setStatus('reconnecting')
        retryTimer = setTimeout(connect, backoffDelay(attempt++))
      }
      ws.onerror = () => ws?.close()
    }

    connect()
    return () => {
      disposed = true
      clearTimeout(retryTimer)
      clearInterval(pingTimer)
      ws?.close()
      store.setStatus('closed')
    }
  }, [store])

  return <LiveContext.Provider value={store}>{children}</LiveContext.Provider>
}

export function useLiveStore(): LiveStore {
  const store = useContext(LiveContext)
  if (!store) throw new Error('useLiveStore must be used inside <LiveProvider>')
  return store
}

export function useLive() {
  const store = useLiveStore()
  return useSyncExternalStore(store.subscribe, store.getSnapshot)
}
