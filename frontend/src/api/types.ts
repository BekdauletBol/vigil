export type Severity = 'low' | 'medium' | 'high' | 'critical'
export type AlertStatus = 'open' | 'investigating' | 'escalated' | 'closed'
export type Channel = 'transfer' | 'card' | 'cash' | 'swift' | 'p2p' | 'crypto'

export interface Flag {
  code: string
  title: string
  weight: number
}

export interface AccountBrief {
  id: string
  code: string
  name: string
  kind: 'individual' | 'legal'
  bank: string
  country: string
}

export interface Account extends AccountBrief {
  tax_id: string
  city: string
  risk_level: 'low' | 'medium' | 'high'
  is_pep: boolean
  opened_at: string
}

export interface Transaction {
  id: string
  ts: string
  sender: AccountBrief
  receiver: AccountBrief
  amount: number
  currency: string
  channel: Channel
  country: string
  purpose: string
  status: string
  risk_score: number
  anomaly_score: number
  flags: Flag[]
}

export interface Alert {
  id: number
  severity: Severity
  status: AlertStatus
  score: number
  typology: string
  flags: Flag[]
  assignee: string | null
  created_at: string
  updated_at: string
  account: AccountBrief
  transaction: Transaction
}

export interface AlertNote {
  id: number
  author: string
  kind: 'comment' | 'system'
  text: string
  created_at: string
}

export interface GraphNode {
  id: string
  label: string
  kind: string
  country: string
  role: 'subject' | 'counterparty'
  volume: number
}

export interface GraphEdge {
  source: string
  target: string
  amount: number
  count: number
  max_score: number
}

export interface AlertDetail extends Omit<Alert, 'account'> {
  account: Account
  notes: AlertNote[]
  related: Transaction[]
  graph_nodes: GraphNode[]
  graph_edges: GraphEdge[]
}

export interface AlertPage {
  items: Alert[]
  total: number
  counts: Record<AlertStatus, number>
}

export interface SeriesPoint {
  t: string
  count: number
  volume: number
  flagged: number
}

export interface Stats {
  tx_count_24h: number
  volume_24h: number
  flagged_24h: number
  avg_risk_24h: number
  open_alerts: number
  critical_alerts: number
  alerts_by_severity: Record<Severity, number>
  alerts_by_status: Record<AlertStatus, number>
  by_channel: { channel: Channel; count: number; volume: number }[]
  top_typologies: { title: string; count: number }[]
  series: SeriesPoint[]
}

export interface Source {
  id: string
  doc: string
  section: string
  text: string
  score: number
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface AlertFilters {
  status?: AlertStatus
  severity?: Severity
  q?: string
}

export interface User {
  id: number
  email: string
  name: string
}

export interface Workspace {
  id: number
  name: string
  kind: 'demo' | 'private'
  api_key_prefix: string | null
  simulator_until: string | null
  created_at: string
  accounts: number
  transactions: number
}

export interface AuthResponse {
  token: string
  user: User
  workspaces: Workspace[]
}

export interface AccountInput {
  code?: string
  name: string
  kind: 'individual' | 'legal'
  tax_id?: string
  bank?: string
  country: string
  city?: string
  is_pep: boolean
}

export interface TransactionInput {
  sender_id: string
  receiver_id: string
  amount: number
  channel: Channel
  country: string
  purpose?: string
}

export interface ImportResult {
  imported: number
  duplicates: number
  created_clients: number
  alerts: number
  errors: { row: number; message: string }[]
}
