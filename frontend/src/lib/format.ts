const nf = new Intl.NumberFormat('ru-RU')
const compactNf = new Intl.NumberFormat('ru-RU', { notation: 'compact', maximumFractionDigits: 1 })

export const formatNumber = (n: number) => nf.format(Math.round(n))

/** Full amount with digit grouping, or compact ("12,3 млн") for KPI tiles. */
export function formatKZT(amount: number, { compact = false } = {}): string {
  return `${compact ? compactNf.format(amount) : nf.format(Math.round(amount))}\u00a0₸`
}

const rtf = new Intl.RelativeTimeFormat('ru', { numeric: 'auto', style: 'short' })

export function formatRelative(iso: string, now: number = Date.now()): string {
  const diff = (new Date(iso).getTime() - now) / 1000
  const abs = Math.abs(diff)
  if (abs < 45) return 'только что'
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute')
  if (abs < 86_400) return rtf.format(Math.round(diff / 3600), 'hour')
  return rtf.format(Math.round(diff / 86_400), 'day')
}

const timeFmt = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
const dateTimeFmt = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
})

export const formatTime = (iso: string) => timeFmt.format(new Date(iso))
export const formatDateTime = (iso: string) => dateTimeFmt.format(new Date(iso))

export function initials(name: string): string {
  const clean = name.replace(/^(ТОО|АО|ИП)\s*/u, '').replace(/[«»"]/gu, '').trim()
  const parts = clean.split(/\s+/u).filter(Boolean)
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?'
}

/** Stable color for an avatar based on the name. */
export function colorFor(name: string): string {
  const palette = ['--blue', '--indigo', '--purple', '--pink', '--orange', '--green', '--teal', '--cyan']
  let h = 0
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return `var(${palette[h % palette.length]})`
}

export function pluralize(n: number, forms: [string, string, string]): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return forms[0]
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms[1]
  return forms[2]
}
