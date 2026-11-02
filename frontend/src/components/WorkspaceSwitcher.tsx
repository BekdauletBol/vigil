import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, ApiError } from '../api/client'
import { useSession } from '../session/SessionProvider'
import { Icon } from './Icon'
import { useToast } from './Toasts'

/** Popover in the sidebar: current workspace, the others, and account actions. */
export function WorkspaceSwitcher() {
  const { workspace, workspaces, user, selectWorkspace, logout, refresh } = useSession()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const toast = useToast()

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', esc)
    }
  }, [open])

  const go = (id: number) => {
    selectWorkspace(id)
    setOpen(false)
    navigate('/app')
  }

  const create = async () => {
    const name = window.prompt('Название пространства', 'Новое пространство')?.trim()
    if (!name) return
    try {
      const ws = await api.createWorkspace(name)
      await refresh()
      selectWorkspace(ws.id)
      setOpen(false)
      navigate('/app/clients')
    } catch (e) {
      toast({ title: 'Не удалось создать', text: e instanceof ApiError ? e.message : String(e), icon: 'alert', color: 'var(--red)' })
    }
  }

  return (
    <div className="ws-switcher" ref={ref}>
      <button type="button" className="ws-switcher__button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className="ws-switcher__dot" data-kind={workspace?.kind ?? 'demo'} />
        <span className="truncate" style={{ flex: 1, textAlign: 'left' }}>
          {workspace?.name ?? 'Демо-банк'}
        </span>
        {workspace?.kind !== 'private' && <span className="badge st-escalated">Демо</span>}
        <Icon name="chevronDown" size={13} />
      </button>
      {open && (
        <div className="ws-menu" role="menu">
          <div className="palette__group">Пространства</div>
          {workspaces.map((w) => (
            <button key={w.id} type="button" role="menuitemradio" aria-checked={w.id === workspace?.id} className="ws-menu__item" onClick={() => go(w.id)}>
              <span className="ws-switcher__dot" data-kind={w.kind} />
              <span className="truncate" style={{ flex: 1 }}>
                {w.name}
              </span>
              <span className="caption">{w.kind === 'demo' ? 'демо' : `${w.accounts} кл.`}</span>
              {w.id === workspace?.id && <Icon name="check" size={14} style={{ color: 'var(--accent)' }} />}
            </button>
          ))}
          <div className="ws-menu__sep" />
          {user ? (
            <>
              <button type="button" className="ws-menu__item" onClick={create}>
                <Icon name="comment" size={15} />
                Новое пространство
              </button>
              <button
                type="button"
                className="ws-menu__item"
                onClick={() => {
                  logout()
                  navigate('/')
                }}
              >
                <Icon name="arrowRight" size={15} />
                Выйти ({user.email})
              </button>
            </>
          ) : (
            <>
              <button type="button" className="ws-menu__item" onClick={() => navigate('/register')}>
                <Icon name="person" size={15} />
                Создать аккаунт
              </button>
              <button type="button" className="ws-menu__item" onClick={() => navigate('/login')}>
                <Icon name="arrowRight" size={15} />
                Войти
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

/** Shown above every page in the shared demo workspace. */
export function DemoBanner() {
  const { isDemo, user, workspaces, selectWorkspace } = useSession()
  const navigate = useNavigate()
  if (!isDemo) return null
  const own = workspaces.find((w) => w.kind === 'private')
  return (
    <div className="demo-banner">
      <Icon name="eye" size={15} />
      <span>
        <b>Демо-режим.</b> Данные синтетические и общие для всех посетителей.
      </span>
      <button
        type="button"
        className="btn btn--filled"
        style={{ height: 28, fontSize: 13 }}
        onClick={() => {
          if (own) {
            selectWorkspace(own.id)
            navigate('/app')
          } else navigate(user ? '/app/clients' : '/register')
        }}
      >
        {own ? 'Моё пространство' : 'Создать своё'}
      </button>
    </div>
  )
}
