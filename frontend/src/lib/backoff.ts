/** Exponential backoff with "full jitter" (AWS architecture blog), capped. */
export function backoffDelay(attempt: number, { base = 500, cap = 15_000, random = Math.random } = {}): number {
  const exp = Math.min(cap, base * 2 ** attempt)
  return Math.round(exp / 2 + random() * (exp / 2))
}
