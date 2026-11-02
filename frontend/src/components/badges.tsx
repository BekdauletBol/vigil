import type { AlertStatus, Severity } from '../api/types'
import { initials, colorFor } from '../lib/format'
import { riskColor, SEVERITY, STATUS } from '../lib/labels'

export function SeverityBadge({ severity }: { severity: Severity }) {
  return (
    <span className={`badge sev-${severity}`}>
      <span className="badge__dot" />
      {SEVERITY[severity]}
    </span>
  )
}

export function StatusBadge({ status }: { status: AlertStatus }) {
  return <span className={`badge st-${status}`}>{STATUS[status]}</span>
}

export function ScorePill({ score }: { score: number }) {
  return (
    <span className="score-pill" style={{ ['--c' as string]: riskColor(score) }} title={`Риск ${score}/100`}>
      {score}
    </span>
  )
}

export function Avatar({ name, size = 30 }: { name: string; size?: number }) {
  return (
    <span className="avatar" style={{ ['--size' as string]: `${size}px`, ['--c' as string]: colorFor(name) }} aria-hidden="true">
      {initials(name)}
    </span>
  )
}
