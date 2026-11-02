import { describe, expect, it } from 'vitest'
import { tx } from '../test/fixtures'
import { LiveStore } from './liveStore'

describe('LiveStore', () => {
  it('prepends new transactions, dedupes and caps the buffer', () => {
    const store = new LiveStore(3)
    const a = tx()
    store.push(a)
    store.push(a)
    store.push(tx())
    store.push(tx())
    store.push(tx())
    const s = store.getSnapshot()
    expect(s.items).toHaveLength(3)
    expect(s.items.filter((t) => t.id === a.id)).toHaveLength(0) // evicted as oldest
  })

  it('buffers while paused and flushes on resume', () => {
    const store = new LiveStore()
    store.push(tx({ id: 'first' }))
    store.setPaused(true)
    store.push(tx({ id: 'second' }))
    store.push(tx({ id: 'third' }))
    expect(store.getSnapshot().items.map((t) => t.id)).toEqual(['first'])
    expect(store.getSnapshot().pending).toBe(2)

    store.setPaused(false)
    const s = store.getSnapshot()
    expect(s.items.map((t) => t.id)).toEqual(['third', 'second', 'first'])
    expect(s.pending).toBe(0)
    expect(s.fresh.has('third')).toBe(true)
  })

  it('computes a per-minute rate over a sliding window', () => {
    const store = new LiveStore()
    const t0 = 1_000_000
    store.push(tx(), t0)
    store.push(tx(), t0 + 10_000)
    store.push(tx(), t0 + 70_000) // first one falls out of the window
    expect(store.getSnapshot().rate).toBe(2)
  })

  it('seeds the rate from snapshot timestamps', () => {
    const store = new LiveStore()
    const now = Date.parse('2026-01-01T12:00:00Z')
    store.setSnapshot(
      [
        tx({ ts: '2026-01-01T11:59:50Z' }),
        tx({ ts: '2026-01-01T11:59:30Z' }),
        tx({ ts: '2026-01-01T11:58:00Z' }), // outside the 60s window
      ],
      now,
    )
    expect(store.getSnapshot().rate).toBe(2)
  })

  it('merges a snapshot without duplicates, newest first', () => {
    const store = new LiveStore()
    const old = tx({ id: 'old', ts: '2026-01-01T10:00:00Z' })
    const fresh = tx({ id: 'new', ts: '2026-01-01T11:00:00Z' })
    store.push(old)
    store.setSnapshot([fresh, old])
    expect(store.getSnapshot().items.map((t) => t.id)).toEqual(['new', 'old'])
  })

  it('notifies subscribers with a new immutable snapshot', () => {
    const store = new LiveStore()
    const before = store.getSnapshot()
    let calls = 0
    const unsubscribe = store.subscribe(() => calls++)
    store.setStatus('open')
    expect(calls).toBe(1)
    expect(store.getSnapshot()).not.toBe(before)
    unsubscribe()
    store.setStatus('closed')
    expect(calls).toBe(1)
  })
})
