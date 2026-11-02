import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'
import { Icon, type IconName } from './Icon'

export interface Toast {
  id: number
  title: string
  text?: string
  icon?: IconName
  color?: string
  onClick?: () => void
}

const Ctx = createContext<(t: Omit<Toast, 'id'>) => void>(() => {})

/** Notification banners in the spirit of iOS: top-center, material background, auto-dismiss. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const seq = useRef(0)

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), [])
  const push = useCallback(
    (t: Omit<Toast, 'id'>) => {
      const id = ++seq.current
      setToasts((list) => [{ ...t, id }, ...list].slice(0, 3))
      setTimeout(() => dismiss(id), 5000)
    },
    [dismiss],
  )

  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <button
            key={t.id}
            type="button"
            className="toast"
            onClick={() => {
              t.onClick?.()
              dismiss(t.id)
            }}
          >
            <span className="row-icon" style={{ ['--c' as string]: t.color ?? 'var(--accent)' }}>
              <Icon name={t.icon ?? 'bell'} size={17} />
            </span>
            <span className="toast__body">
              <div className="toast__title truncate">{t.title}</div>
              {t.text && <div className="toast__text truncate">{t.text}</div>}
            </span>
          </button>
        ))}
      </div>
    </Ctx.Provider>
  )
}

export const useToast = () => useContext(Ctx)
