# API

## Общие принципы

- Все endpoints находятся под `/api`.
- Основной формат обмена: JSON.
- Аутентификация сессионная, через cookie session.
- Большинство endpoints доступны без логина.
- Presets требуют авторизации.

Маршруты: [config/routes.rb](../config/routes.rb)

## Health

| Method | Path | Назначение | Auth |
| --- | --- | --- | --- |
| `GET` | `/api/health` | Heartbeat backend для фронтенда + snapshot статуса Bitfinex | Нет |

Пример ответа:

```json
{
  "bitfinex": true
}
```

Важно:

- успешный HTTP-ответ для фронтенда означает, что доступен backend приложения;
- поле `bitfinex` в JSON это дополнительный snapshot exchange-status;
- realtime-обновление статуса биржи также приходит через `ExchangeStatusChannel`, поэтому `/api/health` не стоит трактовать как единственный источник истины про Bitfinex.

Подробности:

- [07 Jobs and Realtime](07-jobs-and-realtime.md)
- [08 Offline Mode](08-offline-mode.md)

## Auth

| Method | Path | Назначение | Auth |
| --- | --- | --- | --- |
| `POST` | `/api/session` | Логин | Нет |
| `GET` | `/api/session` | Текущий пользователь | Нет |
| `DELETE` | `/api/session` | Логаут | Нет |
| `POST` | `/api/registration` | Регистрация | Нет |

Пример логина:

```json
{
  "username": "alice",
  "password": "secret"
}
```

## Configs

| Method | Path | Назначение | Auth |
| --- | --- | --- | --- |
| `GET` | `/api/configs` | Список доступных crypto symbols и timeframes | Нет |

## Candles

| Method | Path | Назначение | Auth |
| --- | --- | --- | --- |
| `GET` | `/api/candles` | Исторические свечи | Нет |

Основные query params:

- `symbol` - обязателен
- `exchange` - по умолчанию `bitfinex`
- `timeframe` - по умолчанию `1m`
- `start_time`
- `end_time`
- `limit`

Пример:

```text
/api/candles?symbol=BTCUSD&timeframe=15m&limit=500
```

Ответ:

```json
[
  {
    "time": 1740000000,
    "open": 98000.0,
    "high": 98150.0,
    "low": 97820.0,
    "close": 98090.0,
    "volume": 124.53
  }
]
```

## Tickers

| Method | Path | Назначение | Auth |
| --- | --- | --- | --- |
| `GET` | `/api/tickers` | Плитки crypto dashboard | Нет |

Замечание:

- live-часть берется из Bitfinex;
- sparkline строится по данным из БД;
- при недоступности Bitfinex используется fallback к БД.

## Markets

| Method | Path | Назначение | Auth |
| --- | --- | --- | --- |
| `GET` | `/api/markets` | Котировки indices/forex/commodities | Нет |
| `POST` | `/api/markets/add` | Добавить инструмент в market tiles | Нет |
| `POST` | `/api/markets/remove` | Удалить инструмент из market tiles | Нет |

Тело для `add` / `remove`:

```json
{
  "category": "indices",
  "symbol": "^GSPC"
}
```

Ответ `GET /api/markets` содержит:

- текущие инструменты по категориям;
- `available` для выпадающих списков;
- `labels` для человекочитаемых названий.

## Dashboard symbols

| Method | Path | Назначение | Auth |
| --- | --- | --- | --- |
| `POST` | `/api/dashboard/add` | Добавить crypto symbol на главную | Нет |
| `POST` | `/api/dashboard/remove` | Удалить crypto symbol с главной | Нет |

Пример тела:

```json
{
  "symbol": "BTCUSD"
}
```

## Indicators

| Method | Path | Назначение | Auth |
| --- | --- | --- | --- |
| `GET` | `/api/indicators` | Список доступных серверных индикаторов | Нет |
| `POST` | `/api/indicators/:type/compute` | Расчет индикатора | Нет |

Пример:

```json
{
  "symbol": "BTCUSD",
  "timeframe": "1m",
  "period": 14
}
```

Поддерживаются параметры вида:

- `period`
- `short_period`
- `long_period`
- `signal_period`
- `price_key`

## Data Table

| Method | Path | Назначение | Auth |
| --- | --- | --- | --- |
| `GET` | `/api/data_table` | Строки data table | Нет |
| `POST` | `/api/data_table/correlations` | Корреляция двух инструментов | Нет |
| `POST` | `/api/data_table/statistics` | Статистика по набору строк | Нет |

### `GET /api/data_table`

Основные параметры:

- `symbol`
- `timeframe`
- `start_time`
- `end_time`
- `limit`
- `changes`
- `indicators`

`indicators` может приходить как JSON-строка или как массив объектов.

### `POST /api/data_table/correlations`

Пример тела:

```json
{
  "symbol_a": "BTCUSD",
  "symbol_b": "ETHUSD",
  "timeframe": "1h"
}
```

### `POST /api/data_table/statistics`

Пример тела:

```json
{
  "symbol": "BTCUSD",
  "timeframe": "1h",
  "fields": ["close", "volume"],
  "correlation_fields": ["close", "ema_20"]
}
```

## Macro Series

| Method | Path | Назначение | Auth |
| --- | --- | --- | --- |
| `GET` | `/api/macro_series` | Макроэкономические временные ряды | Нет |

Параметры:

- `indicators[]` — список ключей индикаторов (`vix`, `dxy`, `fear_greed`, `fed_rate`, `m2`, `cpi`);
- `from` — начало диапазона (ISO8601 или unix timestamp, опционально);
- `to` — конец диапазона (опционально).

Пример запроса:

```text
/api/macro_series?indicators[]=vix&indicators[]=fear_greed
```

Ответ:

```json
{
  "vix": [[1740000000, 18.5], [1740003600, 19.2]],
  "fear_greed": [[1739952000, 42.0], [1740038400, 38.0]]
}
```

Каждый элемент массива — пара `[unix_timestamp, value]`. Данные в порядке возрастания времени.

Если данные за запрошенный период не загружены, соответствующий ключ будет содержать пустой массив.

## ML-модели и обучение

Требуют аутентификации через сессионную cookie. Реестр моделей в MVP глобальный внутри границы аутентифицированного приложения: модели не принадлежат отдельным пользователям, per-user ACL в фиче 017 не реализован.

> **Security warning:** этот контракт рассчитан на trusted/single-tenant deployment. Перед multi-user или shared-tenant использованием нужно добавить ownership/ACL для моделей, запусков обучения и ActionCable stream-ов, либо явно изолировать tenant-ы на уровне deployment/database.

| Method | Path | Назначение | Auth |
| --- | --- | --- | --- |
| `GET` | `/api/ml/models` | Список ML-моделей | Да |
| `GET` | `/api/ml/training_runs` | Список запусков обучения | Да |
| `POST` | `/api/ml/training_runs` | Создать и поставить запуск обучения в очередь | Да |
| `POST` | `/api/ml/training_runs/:id/cancel` | Запросить cooperative cancellation | Да |

### `GET /api/ml/models`

Параметры:

- `limit` — максимум `50`; значения `<= 0` трактуются как `50`.

Ответ содержит метаданные модели, последний успешный запуск, последний неуспешный запуск и активный запуск. `weights_payload` и blob с весами не сериализуются.

Ключевые поля модели:

- `key`
- `display_name`
- `architecture`
- `prediction_target`
- `serving_status`
- `metric_summary`
- `serving_weight_checksum`
- `latest_successful_training_run`
- `latest_failed_training_run`
- `active_training_run`

`serving_status`: `draft`, `training`, `trained`, `failed`, `disabled`.

### `GET /api/ml/training_runs`

Параметры:

- `limit` — максимум `50`;
- `model_key` — опциональный фильтр по модели.

Ответ содержит неизменяемые snapshot-данные запуска: `dataset_spec`, `resolved_feature_spec`, `hyperparams`, `seed`, `metrics`, `fitted_metadata`, `weight_checksum`, временные метки и структурированное `error_metadata`.

Статусы запуска:

- `queued`
- `running`
- `succeeded`
- `failed`
- `cancelled`

### `POST /api/ml/training_runs`

Пример тела:

```json
{
  "model_key": "btc_direction_v1",
  "display_name": "BTC Direction V1",
  "dataset_spec": {
    "exchange": "bitfinex",
    "symbol": "BTCUSD",
    "timeframe": "1m",
    "label_horizon": 1,
    "start_time": "2026-01-01T00:00:00Z",
    "end_time": "2026-02-01T00:00:00Z"
  },
  "feature_spec": [
    { "type": "log_return", "params": { "period": 1 } }
  ],
  "hyperparams": {
    "seed": 0,
    "max_iterations": 200,
    "label_deadband_return": 0.0
  }
}
```

Поведение:

- неизвестный `model_key` атомарно создает draft-модель и queued-запуск;
- существующий `model_key` переиспользует модель;
- ошибка постановки в очередь откатывает новую model/run-пару;
- второй queued/running-запуск для той же модели возвращает структурированную conflict-ошибку;
- stale `running`-запуск с устаревшим `heartbeat_at` помечается `failed` с метаданными `stale_worker` перед созданием replacement-запуска;
- неуспешный повторный запуск обучения обновляет `latest_failed_training_run`, но не заменяет последние serving-веса.

Ошибки возвращаются в структурированной форме:

```json
{
  "error": {
    "code": "active_training_run_exists",
    "message": "model already has an active training run",
    "details": {}
  }
}
```

### Отмена обучения

`POST /api/ml/training_runs/:id/cancel` записывает `cancellation_requested_at`. Отмена кооперативная: worker, dataset builder, adapter callbacks и inference batching проверяют сохраненный флаг в deterministic yield points. Отмененный запуск не пишет финальные веса и не переводит модель в `trained`.

### Прогресс через ActionCable

Прогресс обучения идет через `MlTrainingProgressChannel`, stream `ml_training:<training_run_id>`.

События:

- `queued`
- `running`
- `progress`
- `succeeded`
- `failed`
- `cancelled`

Нетерминальные события `progress` дедуплицируются и ограничиваются по частоте. Терминальные события отправляются всегда. Сохраненное состояние API остается резервным источником при reconnect/reload.

### Хранение и повторное использование предсказаний

Фича 017 не добавляет HTTP endpoint для чтения prediction rows; data-grid endpoint остается зоной фичи 018. Research-модуль `ml_signal` вызывает backend inference service напрямую.

Успешные prediction rows сохраняются в `ml_predictions`, TimescaleDB hypertable по `ts`, с уникальностью `(ml_model_id, exchange, symbol, timeframe, ts, weight_checksum)`. Это позволяет backtest-у, стартовавшему до retrain, читать свой captured snapshot даже если новый snapshot уже записал те же timestamps. Строка хранит все значения direction-classification tuple:

- `ml_training_run_id`
- `weight_checksum`
- `source_window_checksum`
- `probability`
- `direction`
- `confidence`

Inference переиспользует строку только если совпадают serving `weight_checksum` и `source_window_checksum` для текущего окна свечей. Missing/stale строки пересчитываются батчами и пишутся через guarded upsert:

```sql
ON CONFLICT (ml_model_id, exchange, symbol, timeframe, ts, weight_checksum)
DO UPDATE
SET ...
WHERE (
  (SELECT created_at FROM ml_training_runs WHERE id = ml_predictions.ml_training_run_id),
  ml_predictions.ml_training_run_id
) <= (
  (SELECT created_at FROM ml_training_runs WHERE id = EXCLUDED.ml_training_run_id),
  EXCLUDED.ml_training_run_id
)
```

Так старый serving snapshot не перезаписывает prediction rows от более нового успешного обучения для того же `weight_checksum`, а разные `weight_checksum` остаются отдельными rows для reproducible backtests.

MVP-лимит:

```text
prediction_cells = candle_count * distinct(model_key)
max_prediction_cells = 50_000
```

Формула относится к одному `(exchange, symbol, timeframe)`. Если будущий endpoint примет несколько market tuples за один запрос, его контракт должен расширить формулу до реализации.

## LLM Assistant

Требуют аутентификации.

### Chats

| Method | Path | Назначение | Auth |
| --- | --- | --- | --- |
| `GET` | `/api/assistant_chats` | Список чатов пользователя | Да |
| `GET` | `/api/assistant_chats/:id` | Чат с историей сообщений | Да |
| `POST` | `/api/assistant_chats` | Создать новый чат | Да |
| `PATCH` | `/api/assistant_chats/:id` | Обновить чат (например, title) | Да |
| `DELETE` | `/api/assistant_chats/:id` | Удалить чат | Да |
| `POST` | `/api/assistant_chats/:id/messages` | Отправить сообщение, получить ответ | Да |

### LLM Settings

| Method | Path | Назначение | Auth |
| --- | --- | --- | --- |
| `GET` | `/api/llm_settings` | Настройки провайдеров | Да |
| `PUT` | `/api/llm_settings/:provider` | Сохранить/обновить настройки провайдера | Да |
| `DELETE` | `/api/llm_settings/:provider` | Удалить настройки провайдера | Да |

Подробнее об LLM-ассистенте: [10 LLM Assistant](10-llm-assistant.md)

## Presets

Требуют аутентификации.

| Method | Path | Назначение | Auth |
| --- | --- | --- | --- |
| `GET` | `/api/presets` | Список пресетов пользователя | Да |
| `GET` | `/api/presets/:id` | Получить пресет | Да |
| `POST` | `/api/presets` | Создать пресет | Да |
| `PATCH` | `/api/presets/:id` | Обновить пресет | Да |
| `DELETE` | `/api/presets/:id` | Удалить пресет | Да |
| `GET` | `/api/presets/state` | Текущий server-side snapshot symbols | Да |
| `POST` | `/api/presets/apply_state` | Применить snapshot symbols | Да |
| `POST` | `/api/presets/reset_state` | Сбросить symbols-состояние | Да |

Пример сохранения:

```json
{
  "name": "Morning workspace",
  "is_default": true,
  "payload": {
    "version": 2,
    "tabs": [],
    "activeTabId": null,
    "navPage": "graph"
  }
}
```

## Ошибки

API использует стандартные коды:

- `400 Bad Request` для отсутствующих параметров и невалидных аргументов;
- `401 Unauthorized` для защищенных endpoints;
- `404 Not Found` для отсутствующих записей;
- `422 Unprocessable Entity` для ошибок валидации.

Типовая форма ошибки:

```json
{
  "error": "message"
}
```

Для ошибок валидации модели может использоваться:

```json
{
  "errors": ["Name can't be blank"]
}
```
