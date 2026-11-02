import { useEffect, useId, useMemo, useRef, useState } from 'react'

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(600)
  useEffect(() => {
    if (!ref.current || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(([e]) => e && setWidth(Math.max(120, e.contentRect.width)))
    ro.observe(ref.current)
    return () => ro.disconnect()
  }, [])
  return [ref, width] as const
}

/** Monotone cubic interpolation keeps the curve from overshooting between points. */
export function smoothPath(pts: [number, number][]): string {
  if (pts.length < 2) return pts.length ? `M${pts[0]![0]},${pts[0]![1]}` : ''
  const n = pts.length
  const dx = pts.slice(1).map((p, i) => p[0] - pts[i]![0])
  const m = pts.slice(1).map((p, i) => (p[1] - pts[i]![1]) / (dx[i] || 1))
  const t: number[] = [m[0]!]
  for (let i = 1; i < n - 1; i++) t.push(m[i - 1]! * m[i]! <= 0 ? 0 : (m[i - 1]! + m[i]!) / 2)
  t.push(m[n - 2]!)
  let d = `M${pts[0]![0]},${pts[0]![1]}`
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = pts[i]!
    const [x1, y1] = pts[i + 1]!
    const h = dx[i]! / 3
    d += `C${x0 + h},${y0 + t[i]! * h} ${x1 - h},${y1 - t[i + 1]! * h} ${x1},${y1}`
  }
  return d
}

export interface AreaPoint {
  label: string
  value: number
  secondary?: number
}

export function AreaChart({
  data,
  height = 220,
  color = 'var(--accent)',
  secondaryColor = 'var(--red)',
  format = (v: number) => String(v),
  secondaryLabel,
}: {
  data: AreaPoint[]
  height?: number
  color?: string
  secondaryColor?: string
  format?: (v: number) => string
  secondaryLabel?: string
}) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const gid = useId()
  const pad = { top: 12, right: 8, bottom: 24, left: 44 }
  const w = width - pad.left - pad.right
  const h = height - pad.top - pad.bottom
  const max = Math.max(1, ...data.map((d) => d.value)) * 1.1

  const { line, area, secondary, ticks } = useMemo(() => {
    const x = (i: number) => pad.left + (data.length > 1 ? (i / (data.length - 1)) * w : w / 2)
    const y = (v: number) => pad.top + h - (v / max) * h
    const pts = data.map((d, i) => [x(i), y(d.value)] as [number, number])
    const line = smoothPath(pts)
    const area = pts.length ? `${line}L${pts.at(-1)![0]},${pad.top + h}L${pts[0]![0]},${pad.top + h}Z` : ''
    const sec = data.some((d) => d.secondary) ? smoothPath(data.map((d, i) => [x(i), y(d.secondary ?? 0)])) : ''
    const ticks = [0, 0.5, 1].map((f) => ({ y: pad.top + h - f * h, v: (max / 1.1) * f }))
    return { line, area, secondary: sec, ticks }
  }, [data, w, h, max, pad.left, pad.top])

  const step = data.length > 1 ? w / (data.length - 1) : w
  const hx = hover !== null ? pad.left + hover * step : 0
  const hp = hover !== null ? data[hover] : undefined
  const labelEvery = Math.max(1, Math.ceil(data.length / Math.max(2, Math.floor(w / 70))))

  return (
    <div className="chart" ref={ref} onMouseLeave={() => setHover(null)}>
      <svg
        width={width}
        height={height}
        role="img"
        aria-label="График операций"
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect()
          const i = Math.round((e.clientX - r.left - pad.left) / step)
          setHover(Math.min(data.length - 1, Math.max(0, i)))
        }}
      >
        <defs>
          <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor={color} stopOpacity="0.32" />
            <stop offset="1" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <g className="chart__grid">
          {ticks.map((t) => (
            <line key={t.y} x1={pad.left} x2={pad.left + w} y1={t.y} y2={t.y} />
          ))}
        </g>
        <g className="chart__axis">
          {ticks.map((t) => (
            <text key={t.y} x={pad.left - 8} y={t.y + 4} textAnchor="end">
              {format(t.v)}
            </text>
          ))}
          {data.map((d, i) =>
            i % labelEvery === 0 ? (
              <text key={i} x={pad.left + i * step} y={height - 6} textAnchor="middle">
                {d.label}
              </text>
            ) : null,
          )}
        </g>
        <path d={area} fill={`url(#${gid})`} />
        <path d={line} fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" />
        {secondary && <path d={secondary} fill="none" stroke={secondaryColor} strokeWidth={1.6} strokeDasharray="3 4" />}
        {hp && (
          <g>
            <line x1={hx} x2={hx} y1={pad.top} y2={pad.top + h} stroke="var(--label-3)" strokeWidth={1} />
            <circle cx={hx} cy={pad.top + h - (hp.value / max) * h} r={5} fill="var(--bg-elevated)" stroke={color} strokeWidth={2.5} />
          </g>
        )}
      </svg>
      {hp && (
        <div className="chart__tooltip" style={{ left: Math.min(Math.max(hx, 70), width - 70) }}>
          <div className="caption">{hp.label}</div>
          <div className="headline tabular">{format(hp.value)}</div>
          {secondaryLabel && hp.secondary !== undefined && (
            <div className="caption" style={{ color: secondaryColor }}>
              {secondaryLabel}: {hp.secondary}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function Sparkline({ values, color = 'var(--accent)', height = 34 }: { values: number[]; color?: string; height?: number }) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const gid = useId()
  const max = Math.max(1, ...values)
  const pts = values.map((v, i) => [(i / Math.max(1, values.length - 1)) * width, height - 2 - (v / max) * (height - 4)] as [number, number])
  const d = smoothPath(pts)
  return (
    <div ref={ref} className="kpi__spark">
      <svg width={width} height={height} aria-hidden="true">
        <defs>
          <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor={color} stopOpacity="0.25" />
            <stop offset="1" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {pts.length > 1 && <path d={`${d}L${width},${height}L0,${height}Z`} fill={`url(#${gid})`} />}
        <path d={d} fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
      </svg>
    </div>
  )
}

export interface Ring {
  label: string
  value: number // 0..1
  color: string
  caption: string
}

/** Apple Fitness–style concentric activity rings. */
export function ActivityRings({ rings, size = 150 }: { rings: Ring[]; size?: number }) {
  const stroke = size * 0.11
  const gap = stroke * 0.18
  return (
    <div className="rings">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Кольца активности">
        {rings.map((r, i) => {
          const radius = size / 2 - stroke / 2 - i * (stroke + gap)
          const c = 2 * Math.PI * radius
          const v = Math.min(1, Math.max(0, r.value))
          return (
            <g key={r.label} transform={`rotate(-90 ${size / 2} ${size / 2})`}>
              <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={r.color} strokeOpacity={0.18} strokeWidth={stroke} />
              {v > 0 && <circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={r.color}
                strokeWidth={stroke}
                strokeLinecap="round"
                strokeDasharray={`${c * v} ${c}`}
                style={{ transition: 'stroke-dasharray 900ms var(--spring)' }}
              />}
            </g>
          )
        })}
      </svg>
      <div className="rings__legend">
        {rings.map((r) => (
          <div key={r.label} className="rings__item" style={{ ['--c' as string]: r.color }}>
            <b>{r.caption}</b>
            <span>{r.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function BarList({ items, color }: { items: { label: string; value: number; display?: string }[]; color?: string }) {
  const max = Math.max(1, ...items.map((i) => i.value))
  return (
    <div className="bar-list">
      {items.map((it) => (
        <div key={it.label} className="bar-list__row">
          <span className="truncate">{it.label}</span>
          <span className="secondary tabular">{it.display ?? it.value}</span>
          <div className="bar-list__track">
            <div className="bar-list__fill" style={{ width: `${(it.value / max) * 100}%`, ['--c' as string]: color }} />
          </div>
        </div>
      ))}
    </div>
  )
}

/** Semi-circular gauge for a 0..100 risk score. */
export function RiskGauge({ score, size = 96, color }: { score: number; size?: number; color: string }) {
  const r = size / 2 - 8
  const c = Math.PI * r
  return (
    <svg width={size} height={size * 0.62} viewBox={`0 0 ${size} ${size * 0.62}`} role="img" aria-label={`Риск ${score} из 100`}>
      <path d={`M8,${size / 2} A${r},${r} 0 0 1 ${size - 8},${size / 2}`} fill="none" stroke="var(--fill-3)" strokeWidth={9} strokeLinecap="round" />
      <path
        d={`M8,${size / 2} A${r},${r} 0 0 1 ${size - 8},${size / 2}`}
        fill="none"
        stroke={color}
        strokeWidth={9}
        strokeLinecap="round"
        strokeDasharray={`${(c * score) / 100} ${c}`}
      />
      <text x={size / 2} y={size / 2 - 2} textAnchor="middle" fontSize={size * 0.26} fontWeight={700} fill="var(--label)" style={{ fontFamily: 'var(--font-rounded)' }}>
        {score}
      </text>
    </svg>
  )
}
