import { describe, expect, it } from 'vitest'
import { tx } from '../test/fixtures'
import { filterTransactions } from './LivePage'

describe('filterTransactions', () => {
  const items = [
    tx({ id: 'clean', risk_score: 0 }),
    tx({ id: 'flagged', risk_score: 30 }),
    tx({ id: 'alert', risk_score: 90, purpose: 'Финансовая помощь' }),
  ]
  it('filters by risk band', () => {
    expect(filterTransactions(items, 'all', '').map((t) => t.id)).toEqual(['clean', 'flagged', 'alert'])
    expect(filterTransactions(items, 'flagged', '').map((t) => t.id)).toEqual(['flagged', 'alert'])
    expect(filterTransactions(items, 'alerts', '').map((t) => t.id)).toEqual(['alert'])
  })
  it('searches parties and purpose case-insensitively', () => {
    expect(filterTransactions(items, 'all', 'ФИНАНСОВАЯ').map((t) => t.id)).toEqual(['alert'])
    expect(filterTransactions(items, 'all', 'дала').map((t) => t.id)).toHaveLength(3)
  })
})
