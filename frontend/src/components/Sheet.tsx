import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from './Icon'

const FOCUSABLE = 'a[href],button:not([disabled]),input,textarea,select,[tabindex]:not([tabindex="-1"])'

/** Modal sheet: centered card on desktop, bottom sheet with grabber on phones. Traps focus, closes on Esc. */
export function Sheet({
  title,
  onClose,
  children,
  actions,
  narrow,
}: {
  title: ReactNode
  onClose: () => void
  children: ReactNode
  actions?: ReactNode
  narrow?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    ref.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus()
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key !== 'Tab' || !ref.current) return
      const items = [...ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)]
      const first = items[0]
      const last = items.at(-1)
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last?.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first?.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
      previous?.focus()
    }
  }, [onClose])

  return createPortal(
    <div className="backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} className={`sheet ${narrow ? 'sheet--narrow' : ''}`} role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined}>
        <div className="sheet__bar">
          <span className="sheet__grabber" />
          <div className="headline truncate" style={{ flex: 1, minWidth: 0 }}>
            {title}
          </div>
          {actions}
          <button type="button" className="btn btn--gray btn--icon" onClick={onClose} aria-label="Закрыть">
            <Icon name="xmark" size={15} strokeWidth={2.4} />
          </button>
        </div>
        <div className="sheet__body">{children}</div>
      </div>
    </div>,
    document.body,
  )
}
