import { useMemo, useState } from 'react'
import type { GraphEdge, GraphNode } from '../api/types'
import { formatKZT } from '../lib/format'
import { OFFSHORE, riskColor } from '../lib/labels'

const W = 760
const H = 440

/**
 * Counterparty graph: the subject in the centre, counterparties on a ring,
 * edge width ∝ volume, edge color = highest risk score on that link.
 */
export function NetworkGraph({ nodes, edges }: { nodes: GraphNode[]; edges: GraphEdge[] }) {
  const [hover, setHover] = useState<string | null>(null)

  const layout = useMemo(() => {
    const pos = new Map<string, { x: number; y: number; r: number }>()
    const subject = nodes.find((n) => n.role === 'subject')
    const others = nodes.filter((n) => n.role !== 'subject')
    const maxVol = Math.max(1, ...others.map((n) => n.volume))
    if (subject) pos.set(subject.id, { x: W / 2, y: H / 2, r: 30 })
    others.forEach((n, i) => {
      const angle = (i / others.length) * Math.PI * 2 - Math.PI / 2
      const ring = i % 2 ? 0.86 : 1 // alternate radii so labels breathe
      pos.set(n.id, {
        x: W / 2 + Math.cos(angle) * (W * 0.37) * ring,
        y: H / 2 + Math.sin(angle) * (H * 0.36) * ring,
        r: 12 + 12 * Math.sqrt(n.volume / maxVol),
      })
    })
    return pos
  }, [nodes])

  const maxAmount = Math.max(1, ...edges.map((e) => e.amount))
  const active = (e: GraphEdge) => hover !== null && (e.source === hover || e.target === hover)

  if (nodes.length <= 1) return <div className="empty">Нет связей за последние 7 дней</div>

  return (
    <div className={`graph ${hover ? 'is-hovering' : ''}`}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Граф связей контрагентов">
        <defs>
          {/* userSpaceOnUse: arrow size stays fixed regardless of edge thickness */}
          <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="9" markerHeight="9" markerUnits="userSpaceOnUse" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill="var(--label-2)" />
          </marker>
        </defs>
        {edges.map((e) => {
          const a = layout.get(e.source)
          const b = layout.get(e.target)
          if (!a || !b) return null
          const dx = b.x - a.x
          const dy = b.y - a.y
          const len = Math.hypot(dx, dy) || 1
          // Curve the edge slightly so A→B and B→A do not overlap.
          const mx = (a.x + b.x) / 2 - (dy / len) * 22
          const my = (a.y + b.y) / 2 + (dx / len) * 22
          const ex = b.x - (dx / len) * (b.r + 4)
          const ey = b.y - (dy / len) * (b.r + 4)
          return (
            <path
              key={`${e.source}-${e.target}`}
              className={`graph__edge ${active(e) ? 'is-active' : ''}`}
              d={`M${a.x},${a.y} Q${mx},${my} ${ex},${ey}`}
              stroke={riskColor(e.max_score)}
              strokeOpacity={0.75}
              strokeWidth={1.2 + 7 * Math.sqrt(e.amount / maxAmount)}
              markerEnd="url(#arrow)"
            >
              <title>
                {e.count} опер. · {formatKZT(e.amount)} · макс. риск {e.max_score}
              </title>
            </path>
          )
        })}
        {nodes.map((n) => {
          const p = layout.get(n.id)!
          const isSubject = n.role === 'subject'
          return (
            <g
              key={n.id}
              className="graph__node"
              transform={`translate(${p.x},${p.y})`}
              onMouseEnter={() => setHover(n.id)}
              onMouseLeave={() => setHover(null)}
              tabIndex={0}
              onFocus={() => setHover(n.id)}
              onBlur={() => setHover(null)}
            >
              <circle
                r={p.r}
                fill={isSubject ? 'var(--accent)' : 'var(--bg-elevated)'}
                stroke={isSubject ? 'transparent' : 'var(--separator-opaque)'}
                strokeWidth={1.5}
              />
              <text
                textAnchor="middle"
                y={4}
                fontSize={11}
                fontWeight={700}
                fill={isSubject ? '#fff' : OFFSHORE.has(n.country) ? 'var(--red)' : 'var(--label-2)'}
              >
                {n.country}
              </text>
              <text textAnchor="middle" y={p.r + 14} fontWeight={isSubject ? 700 : 500}>
                {n.label.length > 24 ? `${n.label.slice(0, 23)}…` : n.label}
              </text>
              <text className="sub" textAnchor="middle" y={p.r + 27}>
                {formatKZT(n.volume, { compact: true })}
              </text>
            </g>
          )
        })}
      </svg>
      <div className="graph__legend">
        <span><i style={{ background: 'var(--accent)' }} />Субъект</span>
        <span><i style={{ background: 'var(--green)' }} />Низкий риск</span>
        <span><i style={{ background: 'var(--orange)' }} />Средний</span>
        <span><i style={{ background: 'var(--red)' }} />Высокий</span>
        <span className="tertiary">Толщина — объём · стрелка — направление</span>
      </div>
    </div>
  )
}
