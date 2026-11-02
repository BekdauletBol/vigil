import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'

export type Appearance = 'system' | 'light' | 'dark'
export const ACCENTS = ['blue', 'indigo', 'purple', 'pink', 'orange', 'green', 'teal'] as const
export type Accent = (typeof ACCENTS)[number]

export interface Prefs {
  appearance: Appearance
  accent: Accent
  reduceMotion: boolean
  notifications: boolean
  analystName: string
}

const DEFAULTS: Prefs = {
  appearance: 'system',
  accent: 'blue',
  reduceMotion: false,
  notifications: true,
  analystName: 'Аналитик',
}
const KEY = 'vigil.prefs'

function load(): Prefs {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }
  } catch {
    return DEFAULTS
  }
}

interface PrefsCtx {
  prefs: Prefs
  setPref: <K extends keyof Prefs>(key: K, value: Prefs[K]) => void
}

const Ctx = createContext<PrefsCtx | null>(null)

export function PrefsProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<Prefs>(load)

  useEffect(() => {
    const root = document.documentElement
    if (prefs.appearance === 'system') root.removeAttribute('data-theme')
    else root.setAttribute('data-theme', prefs.appearance)
    root.setAttribute('data-accent', prefs.accent)
    root.setAttribute('data-reduce-motion', String(prefs.reduceMotion))
    try {
      localStorage.setItem(KEY, JSON.stringify(prefs))
    } catch {
      /* storage may be unavailable (private mode) */
    }
  }, [prefs])

  const setPref = useCallback<PrefsCtx['setPref']>((key, value) => setPrefs((p) => ({ ...p, [key]: value })), [])
  return <Ctx.Provider value={{ prefs, setPref }}>{children}</Ctx.Provider>
}

export function usePrefs() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('usePrefs must be used inside <PrefsProvider>')
  return ctx
}
