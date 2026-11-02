import type { AlertStatus, Channel, Severity } from '../api/types'

export const SEVERITY: Record<Severity, string> = {
  low: 'Низкий',
  medium: 'Средний',
  high: 'Высокий',
  critical: 'Критический',
}

export const STATUS: Record<AlertStatus, string> = {
  open: 'Открыт',
  investigating: 'В работе',
  escalated: 'Эскалирован',
  closed: 'Закрыт',
}

export const CHANNEL: Record<Channel, string> = {
  transfer: 'Перевод',
  card: 'Карта',
  cash: 'Наличные',
  swift: 'SWIFT',
  p2p: 'P2P',
  crypto: 'Крипто',
}

export const COUNTRY: Record<string, string> = {
  KZ: 'Казахстан',
  RU: 'Россия',
  UZ: 'Узбекистан',
  KG: 'Кыргызстан',
  AE: 'ОАЭ',
  TR: 'Турция',
  CN: 'Китай',
  VG: 'Британские Виргинские о-ва',
  PA: 'Панама',
  SC: 'Сейшелы',
  KY: 'Каймановы о-ва',
}

/** Mirrors the backend demo list of offshore jurisdictions. */
export const OFFSHORE = new Set(['VG', 'KY', 'PA', 'SC', 'BZ'])

/** Allowed workflow transitions — mirrors the backend so the UI can hide invalid actions. */
export const TRANSITIONS: Record<AlertStatus, AlertStatus[]> = {
  open: ['investigating', 'closed'],
  investigating: ['escalated', 'closed', 'open'],
  escalated: ['closed', 'investigating'],
  closed: ['investigating'],
}

export function riskColor(score: number): string {
  if (score >= 85) return 'var(--pink)'
  if (score >= 65) return 'var(--red)'
  if (score >= 40) return 'var(--orange)'
  if (score >= 15) return 'var(--yellow)'
  return 'var(--green)'
}
