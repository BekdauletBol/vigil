import { useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { Icon } from './Icon'

export interface SegmentOption<T extends string> {
  value: T
  label: ReactNode
  count?: number
}

/** iOS-style segmented control. A radiogroup with arrow-key navigation and a sliding thumb. */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
  className = '',
}: {
  options: SegmentOption<T>[]
  value: T
  onChange: (value: T) => void
  label: string
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [thumb, setThumb] = useState<{ x: number; w: number } | null>(null)
  const index = Math.max(0, options.findIndex((o) => o.value === value))

  useLayoutEffect(() => {
    const measure = () => {
      const el = ref.current?.querySelectorAll<HTMLButtonElement>('button')[index]
      if (el) setThumb({ x: el.offsetLeft - 2, w: el.offsetWidth })
    }
    measure()
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null
    if (ref.current) ro?.observe(ref.current)
    return () => ro?.disconnect()
  }, [index, options.length])

  const onKeyDown = (e: KeyboardEvent) => {
    const delta = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    if (!delta) return
    e.preventDefault()
    const next = options[(index + delta + options.length) % options.length]!
    onChange(next.value)
    ref.current?.querySelectorAll<HTMLButtonElement>('button')[options.indexOf(next)]?.focus()
  }

  return (
    <div ref={ref} role="radiogroup" aria-label={label} className={`segmented ${className}`} onKeyDown={onKeyDown}>
      {thumb && <span className="segmented__thumb" style={{ width: thumb.w, transform: `translateX(${thumb.x}px)` }} />}
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          tabIndex={o.value === value ? 0 : -1}
          onClick={() => onChange(o.value)}
        >
          {o.label}
          {o.count !== undefined && <span className="segmented__count">{o.count}</span>}
        </button>
      ))}
    </div>
  )
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} className="switch" onClick={() => onChange(!checked)} />
  )
}

export function SearchField({
  value,
  onChange,
  placeholder = 'Поиск',
  autoFocus,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  autoFocus?: boolean
}) {
  return (
    <label className="search">
      <Icon name="search" size={16} />
      <span className="sr-only">{placeholder}</span>
      <input
        type="search"
        value={value}
        placeholder={placeholder}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && onChange('')}
      />
      {value && (
        <button type="button" className="search__clear" aria-label="Очистить" onClick={() => onChange('')}>
          <Icon name="xmark" size={11} strokeWidth={3} />
        </button>
      )}
    </label>
  )
}
