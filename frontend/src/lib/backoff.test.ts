import { describe, expect, it } from 'vitest'
import { backoffDelay } from './backoff'

describe('backoffDelay', () => {
  it('grows exponentially within jitter bounds', () => {
    expect(backoffDelay(0, { random: () => 0 })).toBe(250)
    expect(backoffDelay(0, { random: () => 1 })).toBe(500)
    expect(backoffDelay(3, { random: () => 1 })).toBe(4000)
  })
  it('is capped', () => {
    expect(backoffDelay(30, { random: () => 1, cap: 15_000 })).toBe(15_000)
  })
})
