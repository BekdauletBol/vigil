import { describe, expect, it } from 'vitest'
import { alert, page } from '../test/fixtures'
import { applyPatch } from './queries'

describe('applyPatch (optimistic update)', () => {
  it('updates the item and moves the status counter', () => {
    const p = page([alert({ id: 1 }), alert({ id: 2 })])
    const next = applyPatch(p, 1, { status: 'investigating', assignee: 'QA' })
    expect(next.items[0]).toMatchObject({ status: 'investigating', assignee: 'QA' })
    expect(next.counts).toMatchObject({ open: 1, investigating: 1 })
    expect(p.items[0]!.status).toBe('open') // original untouched
  })

  it('is a no-op for unknown ids', () => {
    const p = page([alert({ id: 1 })])
    expect(applyPatch(p, 999, { status: 'closed' })).toBe(p)
  })
})
