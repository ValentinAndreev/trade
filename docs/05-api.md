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
