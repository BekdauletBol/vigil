import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ApiError } from '../api/client'
import { Icon } from '../components/Icon'
import { useSession } from '../session/SessionProvider'

export function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  const { login, register, enterDemo } = useSession()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const isRegister = mode === 'register'

  useEffect(() => {
    document.title = `${isRegister ? 'Регистрация' : 'Вход'} · Vigil`
    setError(null)
  }, [isRegister])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      if (isRegister) {
        await register(email, password, name)
        navigate('/app/clients') // a fresh workspace starts with onboarding
      } else {
        await login(email, password)
        navigate('/app')
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось связаться с сервером')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth">
      <Link to="/" className="auth__back">
        <Icon name="chevronRight" size={14} style={{ transform: 'rotate(180deg)' }} />
        На главную
      </Link>
      <form className="auth__card" onSubmit={submit}>
        <span className="app-icon" style={{ width: 52, height: 52, borderRadius: 13, margin: '0 auto' }}>
          <Icon name="shield" size={28} strokeWidth={2.2} />
        </span>
        <h1 className="title-1 center">{isRegister ? 'Создать аккаунт' : 'Вход в Vigil'}</h1>
        <p className="subhead center" style={{ margin: 0 }}>
          {isRegister ? 'Личное пространство для ваших клиентов и операций.' : 'С возвращением.'}
        </p>

        <div className="list-group auth__fields">
          {isRegister && (
            <label className="field">
              <span>Имя</span>
              <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} autoComplete="name" placeholder="Бекдаулет" />
            </label>
          )}
          <label className="field">
            <span>Email</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" placeholder="you@example.com" />
          </label>
          <label className="field">
            <span>Пароль</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={isRegister ? 8 : 1}
              autoComplete={isRegister ? 'new-password' : 'current-password'}
              placeholder={isRegister ? 'Минимум 8 символов' : ''}
            />
          </label>
        </div>

        {error && (
          <div className="auth__error" role="alert">
            <Icon name="alert" size={15} />
            {error}
          </div>
        )}

        <button type="submit" className="btn btn--filled btn--large" disabled={busy}>
          {busy ? 'Подождите…' : isRegister ? 'Создать аккаунт' : 'Войти'}
        </button>

        <p className="footnote center" style={{ margin: 0 }}>
          {isRegister ? 'Уже есть аккаунт? ' : 'Нет аккаунта? '}
          <Link to={isRegister ? '/login' : '/register'}>{isRegister ? 'Войти' : 'Зарегистрироваться'}</Link>
          {' · '}
          <button
            type="button"
            className="link-button"
            onClick={() => {
              enterDemo()
              navigate('/app')
            }}
          >
            Открыть демо
          </button>
        </p>
      </form>
    </div>
  )
}
