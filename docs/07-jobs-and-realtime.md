# Jobs and Realtime

## Зачем это нужно

Проект постоянно подтягивает новые данные, обновляет агрегаты и доставляет изменения в UI почти в realtime. При этом realtime в системе двуслойный:

- server-side ingestion и broadcast;
- client-side live feeds и browser caches.

## Основные jobs

### `CandleSyncJob`

Главная периодическая задача.

Что делает:

1. Проверяет доступность Bitfinex.
2. Публикует статус в канал `exchange:status`.
3. Проходит по текущему списку symbols из `BitfinexConfig.symbols`.
4. Для каждого symbol запускает `Candle::Syncer`.

Расписание:

- development: каждую минуту
- production: каждую минуту

### `CandleSyncSymbolJob`

Точечная синхронизация одного symbol. Полезна как более узкий механизм, если нужно дернуть обновление конкретного инструмента.

### `CandleBackfillJob`

Исторический backfill по всем symbols. Используется для загрузки данных назад до исторической границы.

### `MacroSyncJob`

Синхронизация макроэкономических данных.

Что делает:

- загружает DXY и VIX через Yahoo Finance (hourly);
- загружает Fear & Greed Index через AlternativeMe API (daily);
- загружает Fed Funds Rate, M2 Money Supply, CPI через FRED API (daily);
- загружает on-chain метрики BTC через Coin Metrics Community API (daily): mvrv_ratio, mvrv_z_score, nupl, realized_price;
- записывает точки в таблицу `macro_series` (TimescaleDB hypertable).

Расписание (Solid Queue recurring tasks):

| Задача | Частота | Индикаторы |
| --- | --- | --- |
| `macro_sync_hourly` | каждый час, минута 5 | DXY, VIX |
| `macro_sync_daily` | ежедневно 14:30 UTC | fear_greed, fed_rate, m2, cpi, mvrv_ratio, mvrv_z_score, nupl, realized_price |

Зависимости:

- Yahoo Finance, AlternativeMe и Coin Metrics Community API работают без ключей;
- FRED-индикаторы (`fed_rate`, `m2`, `cpi`) требуют `MACRO_FRED_API_KEY` или Rails credentials `macro.fred_api_key`. Без ключа FRED-синхронизация пропускается.

Ручной запуск:

```bash
# Первичная загрузка с историей (до 5 лет)
bundle exec rails runner "MacroSyncJob.perform_now(frequency: 'all', backfill: true)"

# Обновить только дневные индикаторы
bundle exec rails runner "MacroSyncJob.perform_now(frequency: 'daily')"

# Обновить только hourly индикаторы
bundle exec rails runner "MacroSyncJob.perform_now(frequency: 'hourly')"
```

Параметр `backfill: true` подтягивает историю. Без него загружаются только последние значения.

### `Candle::Syncer`

Это центральная server-side точка сборки ingestion pipeline.

`Candle::Syncer` выбирает режим синхронизации и собирает зависимости:

- `Candle::Sync::Recent` — регулярная догрузка свежих свечей;
- `Candle::Sync::Backfill` — историческая загрузка;
- `Candle::Sync::HistorySource` — чтение истории из Bitfinex;
- `Candle::Sync::Importer` — запись свечей в БД;
- `Candle::Sync::Broadcaster` — публикация новых свечей в ActionCable;
- `Candle::Sync::AggregateRefresher` — обновление continuous aggregates;
- `Candle::Sync::Paginator` — постраничный обход истории и координация importer/broadcaster/refresher.

Он умеет:

- определять gap по последней известной свече;
- добирать recent data;
- уходить в backfill по истории;
- делать retry при Bitfinex API ошибках и rate limit;
- upsert/import свечей в БД;
- refresh continuous aggregates;
- broadcast новых свечей в realtime.

## Realtime paths

Realtime в проекте идет тремя путями.

### 1. Direct Bitfinex WebSocket в браузере

Открытые графики могут получать live candles напрямую из публичного Bitfinex WS.

Это важно, потому что этот feed:

- зависит от интернета;
- зависит от доступности Bitfinex;
- не зависит от ActionCable backend.

### 2. `CandlesChannel`

Backend также пушит новые свечи в поток:

```text
candles:<symbol>:<timeframe>
```

Назначение:

- доставка новых свечей с backend в UI;
- согласование browser state с серверной синхронизацией.

### 3. `ExchangeStatusChannel`

Статус доступности Bitfinex отправляется в поток:

```text
exchange:status
```

Назначение:

- сообщать фронтенду, доступен ли Bitfinex;
- переключать UI в exchange-degraded mode без признания backend недоступным.

## Последовательность server-side обновления свечей

```mermaid
sequenceDiagram
  participant Scheduler
  participant Job as CandleSyncJob
  participant Health as BitfinexHealth
  participant Syncer as Candle::Syncer
  participant DB as TimescaleDB
  participant Cable as ActionCable
  participant UI as Browser

  Scheduler->>Job: every minute
  Job->>Health: check!
  Health-->>Job: reachable?
  Job->>Cable: broadcast exchange status
  Job->>Syncer: call(symbol)
  Syncer->>DB: read max/min timestamps
  Syncer->>Syncer: fetch missing candles
  Syncer->>DB: upsert/import records
  Syncer->>DB: refresh continuous aggregates
  Syncer->>Cable: broadcast new candles
  Cable-->>UI: realtime updates
```

Отдельно от этого открытый график может параллельно получать live updates напрямую из Bitfinex WS.

## Что означает `/api/health`

`/api/health` в проекте используется фронтендом как heartbeat backend.

Практически это значит:

- успешный HTTP-ответ говорит, что backend приложения доступен;
- JSON-ответ дополнительно содержит snapshot `bitfinex`;
- exchange-status не надо сводить только к `/api/health`, потому что он также приходит через `exchange:status`.

Поэтому состояния:

- `backend unavailable`
- `Bitfinex unavailable`

это разные режимы системы.

## Degraded modes

### Backend доступен, Bitfinex недоступен

Это не полный отказ приложения.

Что происходит:

- UI и backend продолжают работать;
- загруженные графики, tabs, drawings и analytics остаются доступны;
- live crypto sync и exchange-fed updates ставятся на паузу;
- indicator/system analysis по уже имеющимся данным остается доступен;
- статус соединения в UI переходит в exchange-degraded state.

### Backend недоступен

Это уже другой режим:

- API-запросы и ActionCable недоступны;
- browser caches и local workspace-state могут оставаться доступными;
- часть работы продолжается локально, часть блокируется.

Подробности вынесены в отдельный документ:

- [08 Offline Mode](08-offline-mode.md)
