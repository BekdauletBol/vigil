import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { API_BASE } from '../api/client'
import { keys } from '../api/queries'
import type { Alert } from '../api/types'
import { authQuery } from '../session/store'

/**
 * Subscribes to case updates over Server-Sent Events. EventSource reconnects
 * by itself (the server sends `retry: 3000`); we only route events to the cache.
 */
export function useServerEvents(workspaceId: number, onCreated: (alert: Alert) => void) {
  const qc = useQueryClient()
  const handler = useRef(onCreated)
  handler.current = onCreated

  useEffect(() => {
    if (typeof EventSource === 'undefined') return
    const es = new EventSource(`${API_BASE}/events${authQuery()}`)
    const refresh = () => {
      qc.invalidateQueries({ queryKey: ['alerts'] })
      qc.invalidateQueries({ queryKey: keys.stats })
    }
    es.addEventListener('alert.created', (e) => {
      refresh()
      handler.current(JSON.parse((e as MessageEvent).data))
    })
    es.addEventListener('alert.updated', (e) => {
      const alert = JSON.parse((e as MessageEvent).data) as Alert
      refresh()
      qc.invalidateQueries({ queryKey: keys.alert(alert.id) })
    })
    return () => es.close()
  }, [qc, workspaceId])
}
