import { describe, expect, it } from 'vitest'
import { formatKZT, formatRelative, initials, pluralize } from './format'

const norm = (s: string) => s.replace(/\s/g, ' ')

describe('formatKZT', () => {
  it('groups digits and appends the tenge sign', () => {
    expect(norm(formatKZT(12_345_678))).toBe('12 345 678 ₸')
  })
  it('supports compact notation', () => {
    expect(norm(formatKZT(12_300_000, { compact: true }))).toMatch(/^12,3 млн ₸$/)
  })
})

describe('formatRelative', () => {
  const now = Date.parse('2026-01-01T12:00:00Z')
  it('says "только что" for the last minute', () => {
    expect(formatRelative('2026-01-01T11:59:40Z', now)).toBe('только что')
  })
  it('uses minutes and hours', () => {
    expect(formatRelative('2026-01-01T11:55:00Z', now)).toMatch(/5 мин/)
    expect(formatRelative('2026-01-01T09:00:00Z', now)).toMatch(/3 ч/)
  })
})

describe('initials', () => {
  it('skips legal form and quotes', () => {
    expect(initials('ТОО «Алтын Жол»')).toBe('АЖ')
    expect(initials('Сериков Айдар')).toBe('СА')
  })
})

describe('pluralize', () => {
  const forms: [string, string, string] = ['алерт', 'алерта', 'алертов']
  it.each([
    [1, 'алерт'],
    [3, 'алерта'],
    [5, 'алертов'],
    [11, 'алертов'],
    [21, 'алерт'],
    [112, 'алертов'],
  ])('%i → %s', (n, expected) => expect(pluralize(n, forms)).toBe(expected))
})
