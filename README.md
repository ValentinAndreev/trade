# Trade Data Analysis

Внутреннее Rails-приложение для мониторинга и анализа рыночных данных. Система объединяет:

- крипто-графики и свечные данные из Bitfinex;
- рыночные виджеты по индексам, forex и commodities через Yahoo Finance;
- интерактивные графики с оверлеями, индикаторами и разметкой;
- табличный анализ, условия, торговые системы и статистику;
- сохранение пользовательских пресетов и состояния рабочего пространства.

## Что внутри

- Backend: Rails 8, PostgreSQL, TimescaleDB, Solid Queue, Solid Cable
- Frontend: TypeScript, Stimulus, Tailwind CSS, AG Grid, Lightweight Charts
- Интеграции: Bitfinex API, Yahoo Finance API

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

## Полезные команды

```bash
bin/rails db:prepare
bin/rails solid_queue:start
bundle exec rspec
npm test
```

## Карта документации

- [01 Product Overview](docs/01-product-overview.md)
- [02 Architecture](docs/02-architecture.md)
- [03 Domain Model](docs/03-domain-model.md)
- [04 Local Setup](docs/04-local-setup.md)
- [05 API](docs/05-api.md)
- [06 UI Workflows](docs/06-ui-workflows.md)
- [07 Jobs and Realtime](docs/07-jobs-and-realtime.md)
- [08 Offline Mode](docs/08-offline-mode.md)

## С чего читать

Если вы впервые заходите в проект:

1. Прочитайте [docs/01-product-overview.md](docs/01-product-overview.md)
2. Затем [docs/02-architecture.md](docs/02-architecture.md)
3. Для локального запуска откройте [docs/04-local-setup.md](docs/04-local-setup.md)
4. Для прикладной работы с экраном и сценариями откройте [docs/06-ui-workflows.md](docs/06-ui-workflows.md)
