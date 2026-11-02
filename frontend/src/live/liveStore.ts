import type { Transaction } from '../api/types'

export type ConnStatus = 'connecting' | 'open' | 'reconnecting' | 'closed'

export interface LiveState {
  items: Transaction[]
  status: ConnStatus
  paused: boolean
  /** Transactions received while paused, waiting to be shown. */
  pending: number
  latency: number | null
  /** Transactions per minute over a sliding 60s window. */
  rate: number
  /** IDs that arrived in the latest push — used for the row highlight animation. */
  fresh: ReadonlySet<string>
}

/**
 * External store for the live feed, consumed with `useSyncExternalStore`.
 * Plain class with immutable snapshots — no React inside, so it is unit-testable.
 */
export class LiveStore {
  private state: LiveState = {
    items: [],
    status: 'connecting',
    paused: false,
    pending: 0,
    latency: null,
    rate: 0,
    fresh: new Set(),
  }
  private listeners = new Set<() => void>()
  private queue: Transaction[] = []
  private arrivals: number[] = []

  constructor(private readonly max = 250) {}

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getSnapshot = () => this.state

  private set(patch: Partial<LiveState>) {
    this.state = { ...this.state, ...patch }
    this.listeners.forEach((l) => l())
  }

  setSnapshot(items: Transaction[], now = Date.now()) {
    // Seed the rate window from the snapshot so the counter is right right after (re)connect.
    const recent = items.map((t) => Date.parse(t.ts)).filter((ms) => ms > now - 60_000 && ms <= now)
    this.arrivals = [...new Set([...this.arrivals, ...recent])].sort((a, b) => a - b)
    const known = new Set(this.state.items.map((t) => t.id))
    const merged = [...this.state.items, ...items.filter((t) => !known.has(t.id))]
      .sort((a, b) => b.ts.localeCompare(a.ts))
      .slice(0, this.max)
    this.set({ items: merged, fresh: new Set(), rate: this.arrivals.length })
  }

  push(tx: Transaction, now = Date.now()) {
    this.arrivals.push(now)
    while (this.arrivals.length && this.arrivals[0]! < now - 60_000) this.arrivals.shift()
    if (this.state.paused) {
      this.queue.unshift(tx)
      this.queue.length = Math.min(this.queue.length, this.max)
      this.set({ pending: this.queue.length, rate: this.arrivals.length })
      return
    }
    if (this.state.items.some((t) => t.id === tx.id)) return
    this.set({
      items: [tx, ...this.state.items].slice(0, this.max),
      fresh: new Set([tx.id]),
      rate: this.arrivals.length,
    })
  }

  setPaused(paused: boolean) {
    if (paused === this.state.paused) return
    if (!paused && this.queue.length) {
      const ids = new Set(this.queue.map((t) => t.id))
      const items = [...this.queue, ...this.state.items.filter((t) => !ids.has(t.id))].slice(0, this.max)
      this.queue = []
      this.set({ paused, items, pending: 0, fresh: ids })
    } else {
      this.set({ paused })
    }
  }

  setStatus(status: ConnStatus) {
    if (status !== this.state.status) this.set({ status })
  }

  setLatency(latency: number) {
    this.set({ latency })
  }
}
