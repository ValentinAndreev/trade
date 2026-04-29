# Trade Data Analysis

Внутреннее Rails-приложение для мониторинга и анализа рыночных данных. Система объединяет:

- крипто-графики и свечные данные из Bitfinex;
- макроэкономические данные (VIX, DXY, CPI, Fed Rate, M2, Fear & Greed);
- интерактивные графики с оверлеями, индикаторами и разметкой;
- табличный анализ, условия, торговые системы и статистику;
- бэктестинг и оптимизацию торговых систем с поддержкой макро-данных;
- встроенный LLM-ассистент для разработки торговых систем;
- сохранение пользовательских пресетов и состояния рабочего пространства.

## Что внутри

- **Backend**: Rails 8, PostgreSQL, TimescaleDB, Solid Queue, Solid Cable
- **Frontend**: TypeScript, Stimulus, Tailwind CSS, AG Grid, Lightweight Charts
- **Интеграции**: Bitfinex API, Yahoo Finance API, FRED API, AlternativeMe API
- **LLM**: OpenAI, Anthropic, Gemini, OpenRouter, Mistral, xAI, Ollama, llama.cpp

## Быстрый старт

### 1. Подготовить окружение

Минимально нужны:

- Ruby `4.0.1`
- Node.js
- PostgreSQL `17`
- TimescaleDB

Для macOS в репозитории есть скрипт первичной установки:

```bash
./install.sh
```

Подробности по ручной настройке: [docs/04-local-setup.md](docs/04-local-setup.md)

### 2. Установить зависимости и подготовить БД

```bash
bin/setup
```

### 3. Запустить приложение

```bash
bin/dev
```

Это поднимет:

- Rails server
- Solid Queue worker
- JS watcher
- CSS watcher

## Настройка внешних источников данных

### FRED API (макроэкономические данные)

Без ключа FRED-индикаторы (Fed Rate, M2, CPI) не загружаются. Yahoo Finance (DXY, VIX) и AlternativeMe (Fear & Greed) работают без ключей.

Получить ключ: [fred.stlouisfed.org](https://fred.stlouisfed.org) → My Account → API Keys

Прописать:

```bash
VISUAL="code --wait --new-window" bin/rails credentials:edit
```

```yaml
macro:
  fred_api_key: your_key_here
```

### LLM-ассистент

API-ключи провайдеров (Gemini, Anthropic, OpenAI и др.) настраиваются через UI — страница ассистента → настройки провайдера. Ключи хранятся в БД в зашифрованном виде.

## Полезные команды

```bash
bin/rails db:prepare
bin/rails solid_queue:start
bundle exec rspec
npm test
```

### Загрузка макро-данных вручную

```bash
# Первый запуск — загрузить всё с историей
bundle exec rails runner "MacroSyncJob.perform_now(frequency: 'all', backfill: true)"

# Обновить только дневные индикаторы
bundle exec rails runner "MacroSyncJob.perform_now(frequency: 'daily')"
```

После загрузки данные появятся в Data Source колонках таблицы и macro-оверлеях графика.

## Карта документации

- [01 Product Overview](docs/01-product-overview.md)
- [02 Architecture](docs/02-architecture.md)
- [03 Domain Model](docs/03-domain-model.md)
- [04 Local Setup](docs/04-local-setup.md)
- [05 API](docs/05-api.md)
- [06 UI Workflows](docs/06-ui-workflows.md)
- [07 Jobs and Realtime](docs/07-jobs-and-realtime.md)
- [08 Offline Mode](docs/08-offline-mode.md)
- [09 Research & Trading Systems](docs/09-research-systems.md)
- [10 LLM Assistant](docs/10-llm-assistant.md)
- [11 Developer Workflow](docs/11-developer-workflow.md)
- [Memory Bank Development Ops](memory_bank/ops/development.md)
- [Memory Bank CI Ops](memory_bank/ops/ci.md)

## С чего читать

Если вы впервые заходите в проект:

1. Прочитайте [docs/01-product-overview.md](docs/01-product-overview.md)
2. Затем [docs/02-architecture.md](docs/02-architecture.md)
3. Для локального запуска откройте [docs/04-local-setup.md](docs/04-local-setup.md)
4. Для прикладной работы с экраном и сценариями откройте [docs/06-ui-workflows.md](docs/06-ui-workflows.md)
5. Для разработки по memory-bank процессу откройте [docs/11-developer-workflow.md](docs/11-developer-workflow.md)
