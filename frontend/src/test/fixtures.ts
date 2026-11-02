import type { Alert, AlertPage, Transaction } from '../api/types'

export function tx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: crypto.randomUUID(),
    ts: new Date().toISOString(),
    sender: { id: 'ACC-1', name: 'Сериков Айдар', kind: 'individual', bank: 'Есиль Банк', country: 'KZ' },
    receiver: { id: 'ACC-2', name: 'ТОО «Дала Трейд»', kind: 'legal', bank: 'Алатау Финанс', country: 'KZ' },
    amount: 150_000,
    currency: 'KZT',
    channel: 'transfer',
    country: 'KZ',
    purpose: 'Оплата услуг',
    status: 'scored',
    risk_score: 0,
    anomaly_score: 0.1,
    flags: [],
    ...overrides,
  }
}

export function alert(overrides: Partial<Alert> = {}): Alert {
  const t = tx({ risk_score: 80 })
  return {
    id: 101,
    severity: 'high',
    status: 'open',
    score: 80,
    typology: 'Дробление: суммы чуть ниже порога',
    flags: [{ code: 'STRUCTURING', title: 'Дробление: суммы чуть ниже порога', weight: 55 }],
    assignee: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    account: t.sender,
    transaction: t,
    ...overrides,
  }
}

export function page(items: Alert[]): AlertPage {
  return { items, total: items.length, counts: { open: items.length, investigating: 0, escalated: 0, closed: 0 } }
}
