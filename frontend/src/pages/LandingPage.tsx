import { useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Icon, type IconName } from '../components/Icon'
import { useSession } from '../session/SessionProvider'

const FEATURES: { icon: IconName; color: string; title: string; text: string }[] = [
  {
    icon: 'bolt',
    color: 'var(--orange)',
    title: 'Скоринг в реальном времени',
    text: 'Каждая операция проходит правила и ML-модель аномалий за доли секунды. Дробление, офшоры, криптообменники, высокая частота.',
  },
  {
    icon: 'network',
    color: 'var(--blue)',
    title: 'Кейсы и граф связей',
    text: 'Подозрительные операции собираются в кейсы без дублей. Граф контрагентов показывает, куда уходят деньги.',
  },
  {
    icon: 'sparkles',
    color: 'var(--purple)',
    title: 'AI-аналитик с источниками',
    text: 'RAG по базе типологий: заключение по кейсу со ссылками на материалы. Claude, локальная модель или офлайн-режим.',
  },
  {
    icon: 'waveform',
    color: 'var(--green)',
    title: 'Live-лента',
    text: 'Операции приходят по WebSocket, уведомления о новых кейсах — по SSE. Ничего не нужно обновлять вручную.',
  },
  {
    icon: 'doc',
    color: 'var(--teal)',
    title: 'Ваши данные',
    text: 'Добавляйте клиентов и операции формой, загружайте CSV-выгрузки или подключайте свою систему по API-ключу.',
  },
  {
    icon: 'shield',
    color: 'var(--pink)',
    title: 'Изоляция и аудит',
    text: 'Каждое пространство видит только свои данные. Любое изменение статуса кейса записывается в журнал.',
  },
]

const STEPS = [
  { n: '01', title: 'Создайте аккаунт', text: 'Получите личное пространство — пустое и только ваше.' },
  { n: '02', title: 'Загрузите данные', text: 'Форма, CSV-файл, API-интеграция или тестовые данные в один клик.' },
  { n: '03', title: 'Разбирайте кейсы', text: 'Алерты, граф связей, журнал и AI-заключение по каждому кейсу.' },
]

const CURL = `curl -X POST https://vigil-aml.onrender.com/api/v1/transactions \\
  -H "X-API-Key: vk_…" -H "Content-Type: application/json" \\
  -d '{"external_id": "BANK-42", "sender_id": "CL-001",
       "receiver_id": "CL-777", "amount": 9500000,
       "channel": "swift", "country": "VG"}'`

export function LandingPage() {
  const { enterDemo, user } = useSession()
  const navigate = useNavigate()

  useEffect(() => {
    document.title = 'Vigil — мониторинг транзакций и AI-аналитик'
  }, [])

  const tryDemo = () => {
    enterDemo()
    navigate('/app')
  }

  return (
    <div className="landing">
      <header className="landing-nav">
        <Link to="/" className="landing-nav__brand">
          <span className="app-icon" style={{ width: 28, height: 28, borderRadius: 7 }}>
            <Icon name="shield" size={16} strokeWidth={2.2} />
          </span>
          Vigil
        </Link>
        <nav className="landing-nav__links">
          <a href="#features">Возможности</a>
          <a href="#how">Как подключить</a>
          <a href="https://github.com/BekdauletBol/vigil" target="_blank" rel="noreferrer">
            GitHub
          </a>
        </nav>
        <div className="landing-nav__actions">
          {user ? (
            <Link to="/app" className="btn btn--filled">
              Открыть приложение
            </Link>
          ) : (
            <>
              <Link to="/login" className="btn btn--plain">
                Войти
              </Link>
              <button type="button" className="btn btn--filled" onClick={tryDemo}>
                Демо
              </button>
            </>
          )}
        </div>
      </header>

      <section className="hero">
        <span className="hero__eyebrow">AML · финансовый мониторинг</span>
        <h1 className="hero__title">
          Видит схемы
          <br />
          <span className="hero__gradient">до того, как они сработают.</span>
        </h1>
        <p className="hero__lead">
          Vigil оценивает каждую операцию в реальном времени, собирает подозрительные в кейсы
          и помогает аналитику разобраться — с AI, который ссылается на источники.
        </p>
        <div className="hero__cta">
          <button type="button" className="btn btn--filled btn--large" onClick={tryDemo}>
            <Icon name="play" size={15} strokeWidth={2.4} />
            Попробовать демо
          </button>
          <Link to={user ? '/app' : '/register'} className="btn btn--gray btn--large">
            {user ? 'Мои пространства' : 'Создать аккаунт'}
          </Link>
        </div>
        <p className="caption">Демо открывается без регистрации. Все данные синтетические.</p>

        <div className="hero__shot">
          <img src="/landing/overview-dark.jpg" alt="Дашборд Vigil: операции, алерты и поток в реальном времени" />
        </div>
      </section>

      <section className="landing-section" id="features">
        <h2 className="landing-h2">Всё для работы аналитика — в одном окне.</h2>
        <div className="feature-grid">
          {FEATURES.map((f) => (
            <article key={f.title} className="feature">
              <span className="row-icon" style={{ ['--c' as string]: f.color, width: 40, height: 40, borderRadius: 11 }}>
                <Icon name={f.icon} size={22} />
              </span>
              <h3 className="title-3">{f.title}</h3>
              <p className="secondary">{f.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-section showcase">
        <div className="showcase__item">
          <div>
            <h2 className="landing-h2 mt-0">Граф связей вместо таблиц.</h2>
            <p className="secondary landing-p">
              Субъект в центре, контрагенты вокруг. Толщина — объём, цвет — максимальный риск,
              стрелка — направление денег. Офшорные юрисдикции подсвечены.
            </p>
          </div>
          <img src="/landing/graph.jpg" alt="Граф связей контрагентов по кейсу" loading="lazy" />
        </div>
        <div className="showcase__item showcase__item--reverse">
          <div>
            <h2 className="landing-h2 mt-0">Заключение за минуту.</h2>
            <p className="secondary landing-p">
              AI-аналитик подбирает материалы под каждый сработавший признак и пишет заключение
              со ссылками. Решение всегда остаётся за человеком.
            </p>
          </div>
          <img src="/landing/analyst.jpg" alt="AI-аналитик формирует заключение по кейсу" loading="lazy" />
        </div>
      </section>

      <section className="landing-section" id="how">
        <h2 className="landing-h2">Подключите свои данные.</h2>
        <div className="steps">
          {STEPS.map((s) => (
            <div key={s.n} className="step">
              <span className="step__n">{s.n}</span>
              <h3 className="title-3">{s.title}</h3>
              <p className="secondary">{s.text}</p>
            </div>
          ))}
        </div>
        <div className="code-card">
          <div className="code-card__bar">
            <i />
            <i />
            <i />
            <span>Интеграция с вашей системой</span>
          </div>
          <pre>{CURL}</pre>
        </div>
      </section>

      <section className="landing-section landing-final">
        <h2 className="landing-h2">Посмотрите сами.</h2>
        <div className="hero__cta">
          <button type="button" className="btn btn--filled btn--large" onClick={tryDemo}>
            Попробовать демо
          </button>
          {!user && (
            <Link to="/register" className="btn btn--gray btn--large">
              Создать аккаунт
            </Link>
          )}
        </div>
      </section>

      <footer className="landing-footer">
        <div className="landing-footer__stack">
          {['FastAPI', 'PostgreSQL', 'Redis', 'Celery', 'WebSocket', 'SSE', 'React', 'TypeScript', 'Docker'].map((t) => (
            <span key={t} className="badge">
              {t}
            </span>
          ))}
        </div>
        <p className="caption">
          Vigil — учебный pet-проект Бекдаулета Болатова. Не связан с государственными органами;
          клиенты, банки и операции в демо сгенерированы.
        </p>
      </footer>
    </div>
  )
}
