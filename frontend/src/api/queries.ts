import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './client'
import type { Alert, AlertDetail, AlertFilters, AlertPage, AlertStatus } from './types'

export const keys = {
  stats: ['stats'] as const,
  alerts: (f: AlertFilters) => ['alerts', f] as const,
  alert: (id: number) => ['alert', id] as const,
}

export const useStats = () =>
  useQuery({ queryKey: keys.stats, queryFn: () => api.stats(60), refetchInterval: 15_000 })

export const useAlerts = (filters: AlertFilters) =>
  useQuery({
    queryKey: keys.alerts(filters),
    queryFn: () => api.alerts({ ...filters, limit: 100 }),
    placeholderData: (prev) => prev,
  })

export const useAlert = (id: number | null) =>
  useQuery({ queryKey: keys.alert(id ?? 0), queryFn: () => api.alert(id!), enabled: id !== null })

interface UpdateVars {
  id: number
  status?: AlertStatus
  assignee?: string | null
}

/**
 * Optimistic status/assignee update: the UI changes instantly and rolls back
 * if the server rejects the transition (e.g. 409 for a forbidden workflow step).
 */
export function useUpdateAlert(author: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...patch }: UpdateVars) => api.updateAlert(id, { ...patch, author }),
    onMutate: async ({ id, ...patch }) => {
      await qc.cancelQueries({ queryKey: ['alerts'] })
      await qc.cancelQueries({ queryKey: keys.alert(id) })
      const lists = qc.getQueriesData<AlertPage>({ queryKey: ['alerts'] })
      const detail = qc.getQueryData<AlertDetail>(keys.alert(id))
      qc.setQueriesData<AlertPage>({ queryKey: ['alerts'] }, (page) => page && applyPatch(page, id, patch))
      if (detail) qc.setQueryData<AlertDetail>(keys.alert(id), { ...detail, ...patch })
      return { lists, detail }
    },
    onError: (_err, { id }, ctx) => {
      ctx?.lists.forEach(([key, data]) => qc.setQueryData(key, data))
      if (ctx?.detail) qc.setQueryData(keys.alert(id), ctx.detail)
    },
    onSettled: (_data, _err, { id }) => {
      qc.invalidateQueries({ queryKey: ['alerts'] })
      qc.invalidateQueries({ queryKey: keys.alert(id) })
      qc.invalidateQueries({ queryKey: keys.stats })
    },
  })
}

export function applyPatch(page: AlertPage, id: number, patch: Partial<Pick<Alert, 'status' | 'assignee'>>): AlertPage {
  const target = page.items.find((a) => a.id === id)
  if (!target) return page
  const counts = { ...page.counts }
  if (patch.status && patch.status !== target.status) {
    counts[target.status] = Math.max(0, (counts[target.status] ?? 0) - 1)
    counts[patch.status] = (counts[patch.status] ?? 0) + 1
  }
  return { ...page, counts, items: page.items.map((a) => (a.id === id ? { ...a, ...patch } : a)) }
}

export function useAddNote(author: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, text }: { id: number; text: string }) => api.addNote(id, text, author),
    onSuccess: (note, { id }) => {
      qc.setQueryData<AlertDetail>(keys.alert(id), (d) => d && { ...d, notes: [...d.notes, note] })
    },
  })
}
