# Vigil — мониторинг транзакций и AI-аналитик для AML

Fullstack-проект: система финансового мониторинга, которая в реальном времени принимает
банковские операции, оценивает их риск (правила + ML), заводит кейсы на подозрительные
операции и помогает аналитику разбирать их с помощью LLM (RAG).
Интерфейс сделан по Apple Human Interface Guidelines.

> Все клиенты, банки и операции сгенерированы синтетически. Пороговые значения и база
> знаний учебные и не являются нормативными документами.

![Обзор](docs/screenshots/overview.png)

<table>
  <tr>
    <td><img src="docs/screenshots/graph.png" alt="Граф связей по кейсу"></td>
    <td><img src="docs/screenshots/analyst.png" alt="AI-аналитик"></td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/live.png" alt="Live-лента по WebSocket"></td>
    <td><img src="docs/screenshots/overview-dark.png" alt="Тёмная тема"></td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/alert.png" alt="Карточка кейса"></td>
    <td><img src="docs/screenshots/palette.png" alt="Палитра команд ⌘K"></td>
  </tr>
</table>
<p align="center"><img src="docs/screenshots/mobile.png" width="300" alt="Мобильная версия"></p>

## Что внутри

| | |
|---|---|
| **Backend** | Python 3.12, FastAPI, SQLAlchemy 2 (async), PostgreSQL, Alembic, Redis, Celery |
| **Realtime** | WebSocket (лента операций), Server-Sent Events (алерты, стриминг ответа LLM), Redis Pub/Sub |
| **AI / ML** | RAG по базе знаний (TF-IDF, офлайн), провайдеры Claude / Ollama (локальная модель) / офлайн-мок, IsolationForest для аномалий |
| **Frontend** | React 19, TypeScript (strict), React Router, TanStack Query, собственная дизайн-система по Apple HIG, SVG-графики без библиотек |
| **Тесты** | pytest (API, WebSocket, SSE, правила, RAG; SQLite и PostgreSQL), Vitest + Testing Library (компоненты, хуки, стриминг) |
| **DevOps** | Docker (multi-stage, non-root), docker-compose, nginx (WS/SSE-прокси), GitHub Actions, GitLab CI |

## Архитектура

```mermaid
flowchart LR
    SIM[Симулятор банка] -- "POST /transactions" --> API
    subgraph Backend
      API[FastAPI] -- "task" --> Q[(Redis broker)]
      Q --> W[Celery worker<br/>правила + ML]
      W -- "INSERT alerts" --> PG[(PostgreSQL)]
      API <--> PG
      W -- "publish" --> PS[(Redis Pub/Sub)]
      PS --> API
      BEAT[Celery beat] --> Q
    end
    API -- "WebSocket: операции" --> UI
    API -- "SSE: алерты" --> UI
    API -- "SSE: ответ LLM" --> UI
    UI[React SPA] -- "REST" --> API
    API -. "RAG" .-> LLM{{Claude / Ollama / mock}}
```

**Поток операции.** Внешняя система шлёт транзакцию на `POST /api/v1/transactions`
(идемпотентно по `external_id`) → API сохраняет её и ставит задачу в Celery →
воркер считает признаки (частота за 10 минут, повторы сумм у порога, возраст счёта, ПДЛ,
юрисдикция), прогоняет правила и ML-модель, при риске ≥ 65 создаёт алерт →
публикует событие в Redis → все реплики API раздают его клиентам по WebSocket и SSE.

## Возможности

- **Обзор** — KPI за сутки, поток операций по минутам, «кольца» состояния очереди, типологии и каналы.
- **Live-лента** — операции по WebSocket сразу после скоринга: пауза с буфером, фильтры,
  индикатор соединения с задержкой (ping/pong), автопереподключение с экспоненциальной задержкой и jitter.
- **Алерты** — очередь кейсов с фильтрами в URL; повторные операции клиента по той же
  типологии в течение часа прикрепляются к открытому кейсу, а не плодят новые; карточка кейса: вклад каждого признака в риск,
  **граф связей** контрагентов (SVG), операции за 7 дней, журнал аудита и комментарии.
  Смена статуса — оптимистичное обновление с откатом, если сервер отклонил переход (`409`).
- **AI-аналитик** — чат со стримингом по SSE (`fetch` + `ReadableStream`), отмена генерации,
  ссылки на источники `[1]`, автоматическое заключение по кейсу.
- **Уведомления** — новые критические алерты приходят по SSE баннером в стиле iOS.
- **⌘K** — палитра команд в стиле Spotlight: разделы, действия, поиск кейсов.
- **Настройки** — тема (авто/светлая/тёмная), акцентный цвет, уменьшение движения, статус БД и Redis.
- Адаптивность: sidebar на десктопе → tab bar на телефоне, sheet снизу с «грабером».

## Скоринг риска

Правила (`backend/app/services/risk.py`) — чистые функции, покрытые тестами:

| Признак | Вес |
|---|---|
| Операция ≥ порога | 35 |
| Дробление: сумма 85–99% порога, вес растёт с каждым повтором за 10 минут | 15 → 55 |
| Офшорная юрисдикция | 25 |
| Криптообменник | 20 |
| Высокая частота (≥ 4 операций за 10 минут) | 20 |
| Крупные наличные / новый счёт / ПДЛ / ночное время / круглая сумма | 6–15 |
| Аномалия по ML (IsolationForest) | до 20 |

Итог 0–100 → уровень: `low < 40 ≤ medium < 65 ≤ high < 85 ≤ critical`.

## AI: RAG и провайдеры

1. Перед ответом сервер загружает кейс (факты, связи, последние операции) и ищет
   3 фрагмента в базе знаний (`backend/app/ai/knowledge/*.md`) — TF-IDF по символьным
   n-граммам хорошо работает с русской морфологией и не требует внешних эмбеддингов.
2. Поиск идёт по каждому сработавшему признаку отдельно (один источник на сигнал), затем по вопросу.
3. Кейс и фрагменты передаются модели в тегах `<case>` и `<knowledge>`; системный промпт
   требует ссылаться на источники и не делать выводов о виновности.
4. Провайдер выбирается переменной `LLM_PROVIDER`:
   - `anthropic` — Claude через официальный SDK (`ANTHROPIC_API_KEY`);
   - `ollama` — локальная модель, данные не покидают контур (`docker compose --profile ollama up`);
   - `mock` — офлайн-аналитик по шаблону, чтобы демо работало без ключей;
   - `auto` (по умолчанию) — Claude при наличии ключа, иначе mock.

## Запуск

### Docker (весь стек)

```bash
docker compose up -d --build
```

- UI — http://localhost:8080
- Swagger — http://localhost:8080/api/docs

Поднимаются PostgreSQL, Redis, API (миграции и сид при старте), Celery worker и beat,
симулятор банка и nginx с фронтендом. С ключом Claude:

```bash
ANTHROPIC_API_KEY=sk-ant-... docker compose up -d
```

### Локально, без Docker

```bash
make dev-api   # FastAPI на SQLite, in-memory шина, встроенный симулятор
make dev-web   # Vite на http://localhost:5173
```

### Тесты и линтеры

```bash
make test      # pytest + vitest
make lint      # ruff + eslint + tsc
cd backend && TEST_DATABASE_URL=postgresql+asyncpg://vigil:vigil@localhost:5432/vigil uv run pytest
```

## API

| Метод | Путь | Описание |
|---|---|---|
| `POST` | `/api/v1/transactions` | Приём операции от внешней системы (202, идемпотентно) |
| `GET` | `/api/v1/transactions` | Последние операции, фильтр `min_score` |
| `GET` | `/api/v1/alerts` | Кейсы: `status`, `severity`, `q`, пагинация, счётчики |
| `GET` | `/api/v1/alerts/{id}` | Кейс + субъект + операции + граф связей + журнал |
| `PATCH` | `/api/v1/alerts/{id}` | Статус/исполнитель с проверкой переходов и аудитом |
| `POST` | `/api/v1/alerts/{id}/notes` | Комментарий аналитика |
| `GET` | `/api/v1/stats` | KPI, ряды по минутам, разрезы |
| `POST` | `/api/v1/analyst/chat` | Ответ AI-аналитика (SSE: `meta` → `delta`… → `done`) |
| `GET` | `/api/v1/knowledge/search` | Поиск по базе знаний |
| `WS` | `/api/v1/ws/transactions` | Снимок + поток операций, ping/pong |
| `GET` | `/api/v1/events` | SSE: `alert.created`, `alert.updated` |
| `GET` | `/api/v1/health/ready` | Готовность: БД и Redis |

## Структура

```
backend/
  app/
    api/routes/     REST, WebSocket, SSE
    services/       транзакции, алерты, статистика, правила риска, генератор данных
    ml/             IsolationForest
    ai/             RAG: retriever, провайдеры LLM, база знаний
    realtime/       шина событий (Redis / in-memory)
    worker/         Celery: скоринг, периодические задачи
  alembic/          миграции
  tests/
frontend/
  src/
    api/            типизированный клиент и хуки TanStack Query
    live/           WebSocket-провайдер, внешний store, SSE
    components/     дизайн-система: контролы, sheet, графики, граф связей, ⌘K
    pages/          Обзор, Live, Алерты, AI-аналитик, Настройки
    styles/         токены HIG (цвета, материалы, типографика), компоненты
```

## Соответствие вакансиям

**Frontend:** HTML/CSS/JS и TypeScript · React · адаптивная вёрстка (sidebar ↔ tab bar, sheet) ·
REST API · WebSocket и SSE · интерфейс для LLM-сервиса со стримингом · тесты frontend ·
Docker и CI/CD · Git.

**Backend:** Python · FastAPI · PostgreSQL и SQL (агрегации, индексы, миграции Alembic) ·
REST API и интеграция с внешней системой · Docker · Linux-контейнеры · Celery и Redis ·
WebSocket · AI/LLM (RAG, локальные модели через Ollama) · ML (IsolationForest) ·
GitHub Actions и GitLab CI.
