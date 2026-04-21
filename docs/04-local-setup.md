# Local Setup

## Что нужно

Для локального запуска проекта нужны:

- Ruby `4.0.1`
- Bundler
- Node.js
- PostgreSQL `17`
- TimescaleDB

Проект использует:

- Rails server;
- Solid Queue worker;
- JS/CSS watchers;
- PostgreSQL с расширением TimescaleDB.

## Быстрый путь для macOS

В репозитории есть скрипт `install.sh`, который:

- ставит Homebrew, если его нет;
- ставит PostgreSQL 17;
- ставит TimescaleDB;
- ставит Node.js;
- ставит Ruby `4.0.1` через `ruby-install`;
- выполняет `bundle install` и `npm install`;
- готовит БД и проверяет hypertable / continuous aggregates.

Запуск:

```bash
./install.sh
```

Ограничение:

- скрипт написан под macOS и не подходит как универсальная инструкция для Linux.

## Ручная установка

### 1. Установить runtime зависимости

- Ruby `4.0.1`
- PostgreSQL `17`
- TimescaleDB extension
- Node.js

### 2. Установить gem и npm зависимости

```bash
bundle install
npm install
```

### 3. Подготовить БД

```bash
bin/rails db:prepare
```

Если нужно пересоздать БД:

```bash
bin/setup --reset
```

## Старт разработки

Основной способ:

```bash
bin/dev
```

Под капотом `Procfile.dev` запускает четыре процесса:

- `web`: Rails server
- `jobs`: `bin/rails solid_queue:start`
- `js`: `npm run build -- --watch`
- `css`: `npm run build:css -- --watch`

## Альтернативные команды

Если нужны процессы по отдельности:

```bash
bin/rails server
bin/rails solid_queue:start
npm run build -- --watch
npm run build:css -- --watch
```

## Настройка внешних источников данных

### FRED API

FRED предоставляет макроэкономические данные: Fed Funds Rate, M2 Money Supply, CPI. Без ключа эти три индикатора не загружаются. DXY и VIX (Yahoo Finance) и Fear & Greed (AlternativeMe) работают без ключей.

Получить ключ: [fred.stlouisfed.org](https://fred.stlouisfed.org) → My Account → API Keys → Request API Key (бесплатно).

Прописать в Rails credentials:

```bash
VISUAL="code --wait --new-window" bin/rails credentials:edit
```

```yaml
macro:
  fred_api_key: your_key_here
```

Ключ читается автоматически через `MacroConfig.fred_api_key`.

### LLM-ассистент

API-ключи LLM-провайдеров (Gemini, Anthropic, OpenAI и др.) **не прописываются в credentials**. Они вводятся через UI и хранятся в БД в зашифрованном виде (`llm_settings.api_key`).

Путь в UI: страница ассистента → иконка настроек → выбрать провайдер → ввести ключ → сохранить.

## Первоначальная загрузка данных

### Свечи

Свечи загружаются автоматически каждую минуту через `CandleSyncJob`. Для полного backfill есть отдельный job:

```bash
bundle exec rails runner "CandleBackfillJob.perform_now"
```

### Макро-данные

Макро-данные по расписанию не загружаются при первом запуске — расписание работает только пока запущен Solid Queue worker. Для начальной загрузки запустить вручную:

```bash
bundle exec rails runner "MacroSyncJob.perform_now(frequency: 'all', backfill: true)"
```

`backfill: true` подтягивает историю (до 5 лет). Без него загрузятся только последние значения.

## Что должно работать после запуска

После старта стоит проверить:

1. Главная страница открывается.
2. `GET /api/health` отвечает JSON — backend reachable из браузера.
3. В логах нет ошибок подключения к PostgreSQL.
4. Solid Queue worker запущен.
5. Через минуту появляются записи от `CandleSyncJob`, если внешняя сеть доступна.

## База данных и TimescaleDB

Проект рассчитывает на наличие:

- hypertable `candles`;
- hypertable `macro_series`;
- continuous aggregates:
  - `cagg_candles_5m`
  - `cagg_candles_15m`
  - `cagg_candles_1h`
  - `cagg_candles_4h`
  - `cagg_candles_1d`

Если расширение или агрегаты не создались, графики и аналитика по таймфреймам выше `1m` будут работать некорректно или медленно.

## Полезные команды

### Backend

```bash
bundle exec rspec
bin/rails console
bin/rails db:migrate
```

### Frontend

```bash
npm test
npm run build
npm run build:css
```

### Диагностика макро-данных

```bash
# Сколько записей в macro_series
bin/rails runner "puts MacroSeries.group(:indicator).count"

# Ручной запуск синхронизации дневных данных
bin/rails runner "MacroSyncJob.perform_now(frequency: 'daily')"

# Ручной запуск с полным backfill
bin/rails runner "MacroSyncJob.perform_now(frequency: 'all', backfill: true)"
```

## Что читать дальше

- [02 Architecture](02-architecture.md)
- [05 API](05-api.md)
- [07 Jobs and Realtime](07-jobs-and-realtime.md)
- [08 Offline Mode](08-offline-mode.md)
