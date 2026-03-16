# Research Implementation

## Назначение

Этот документ описывает **текущее состояние реализации** server-side режима `Research`.

Это уже не план “что когда-нибудь будет”, а фиксация того, что реально работает в коде:

- отдельный таб `Research`;
- серверный запуск исследований;
- серверные модули;
- серверный backtest;
- optimization в памяти;
- просмотр equity, статистики и всех сделок в UI.

## Что уже реализовано

Сейчас в проекте есть два независимых режима:

### 1. Fast Lab

Это старый быстрый режим:

- chart tabs;
- data tabs;
- indicator columns;
- conditions;
- простые systems;
- system stats.

Он не ломался и не переписывался.

### 2. Research

Это отдельный режим для server-side анализа:

- отдельный таб `Research`;
- отдельный API endpoint;
- отдельный серверный runtime;
- optimization на сервере;
- отображение результатов в отдельном UI.

## Общая схема реализации

Текущий поток выполнения такой:

1. Пользователь открывает таб `Research`.
2. UI отправляет на сервер описание:
   - dataset;
   - system;
   - module;
   - execution;
   - optimization.
3. `Research::RunRequest` разбирает и валидирует payload.
4. `Research::SystemRegistry` разрешает пару `system + module` в объект системы.
5. `Api::ResearchController` только связывает request, executor и optimizer.
6. `Research::Executor`:
   - загружает бары;
   - вызывает нужный серверный модуль;
   - объединяет `bar + result`;
   - передает это в `Research::BacktestEngine`.
7. `Research::BacktestEngine` строит сделки.
8. Если включена optimization, `Research::Optimizer` многократно запускает тот же `Executor`.
9. Сервер возвращает все прогоны в память ответа API.
10. Фронтенд считает статистику тем же кодом, что и в Fast Lab.
11. UI показывает:
    - equity;
    - статистику;
    - все сделки;
    - график зависимости метрики от оптимизируемого параметра;
    - таблицу всех прогонов.

## Что сейчас поддерживается

### Systems

Сейчас реализованы два типа систем:

#### `price_module_cross`

Смысл:

- цена пересекает значение серверного модуля;
- вверх -> long;
- вниз -> short.

Поддерживаемый модуль:

- `ema`

Пример:

- `close` пересекает `EMA` вверх -> long;
- `close` пересекает `EMA` вниз -> short.

#### `oscillator_threshold`

Смысл:

- серверный модуль работает как осциллятор;
- вход происходит по входу в пороговые зоны.

Поддерживаемый модуль:

- `rsi`

Пример:

- `RSI` входит ниже `lower_threshold` -> long;
- `RSI` входит выше `upper_threshold` -> short.

### Server Modules

Сейчас реализованы два серверных модуля:

#### `ema`

- серверный расчет `EMA`;
- возвращает series:

```ruby
[
  { time: 1704067200, result: { value: 42100.2 } },
  { time: 1704070800, result: { value: 42140.8 } }
]
```

#### `rsi`

- серверный расчет `RSI`;
- возвращает series:

```ruby
[
  { time: 1704067200, result: { value: 27.3 } },
  { time: 1704070800, result: { value: 34.9 } }
]
```

## Где это реализовано

### Frontend

Основные файлы:

- `app/javascript/controllers/research_controller.ts`
- `app/javascript/research/optimization_chart.ts`
- `app/javascript/research/runs_grid.ts`
- `app/javascript/research/types.ts`

Что делает frontend:

- хранит состояние формы `Research`;
- отправляет запрос в `/api/research/run`;
- получает массив runs;
- считает статистику через существующий `computeSystemStats`;
- переиспользует существующие блоки metrics / equity / trades;
- рисует optimization chart и runs grid.

### Backend

Основные файлы:

- `app/controllers/api/research_controller.rb`
- `app/services/research/run_request.rb`
- `app/services/research/executor.rb`
- `app/services/research/backtest_engine.rb`
- `app/services/research/optimizer.rb`
- `app/services/research/system_registry.rb`
- `app/services/research/module_registry.rb`
- `app/services/research/systems/base.rb`
- `app/services/research/systems/price_module_cross.rb`
- `app/services/research/systems/oscillator_threshold.rb`
- `app/services/research/modules/ema.rb`
- `app/services/research/modules/rsi.rb`

## Backend-архитектура

### `Api::ResearchController`

Задача:

- принять frontend payload;
- создать `Research::RunRequest`;
- запустить один run или optimization;
- вернуть response payload.

Контроллер специально сделан тонким.

Он не содержит:

- mapping `system + module`;
- mapping optimization target;
- нормализацию runtime params;
- торговую логику.

### `Research::RunRequest`

Это объект разбора frontend payload.

Он:

- извлекает dataset;
- извлекает `system` и `module`;
- извлекает `execution`;
- извлекает `optimization`;
- создает объект системы через `Research::SystemRegistry`;
- строит normalized runtime params;
- формирует response payload.

### `Research::SystemRegistry`

Это реестр допустимых связок:

- `price_module_cross + ema`
- `oscillator_threshold + rsi`

Результат работы реестра:

- объект системы, который знает:
  - какой server module нужен;
  - какие runtime params нужны;
  - какой strategy key возвращать;
  - какие optimization target допустимы;
  - как вычислять торговый сигнал.

### `Research::ModuleRegistry`

Это реестр серверных модулей.

Сейчас он разрешает:

- `ema -> Research::Modules::Ema`
- `rsi -> Research::Modules::Rsi`

### `Research::Systems::*`

Сейчас реализованы:

- `Research::Systems::PriceModuleCross`
- `Research::Systems::OscillatorThreshold`

Именно эти объекты содержат предметную логику:

- сбор runtime params;
- signal logic;
- mapping optimization target;
- формирование `run.params`.

### `Research::Executor`

Это главный server-side исполнитель одного запуска.

Он:

- загружает свечи через `Candle::FindQuery`;
- берет module class из `Research::ModuleRegistry`;
- вызывает нужный модуль;
- превращает candles и output модуля в общий runtime-ряд;
- запускает `Research::BacktestEngine`;
- возвращает один результат запуска.

Внутренний runtime-формат на один бар:

```ruby
{
  time: 1704067200,
  bar: {
    open: 42010.0,
    high: 42240.0,
    low: 41920.0,
    close: 42100.0,
    volume: 1532.4
  },
  result: {
    ema: { value: 42080.4 }
  }
}
```

Или:

```ruby
{
  time: 1704067200,
  bar: {
    open: 42010.0,
    high: 42240.0,
    low: 41920.0,
    close: 42100.0,
    volume: 1532.4
  },
  result: {
    rsi: { value: 28.7 }
  }
}
```

### `Research::BacktestEngine`

Это чистое расчетное ядро.

Оно:

- принимает уже подготовленные rows;
- вызывает signal logic объекта системы;
- строит сделки;
- учитывает:
  - `fee_bps`;
  - `slippage_bps`;
  - `position_mode`.

### `Research::Optimizer`

Это обертка над многократным запуском `Executor`.

Он:

- получает optimization target;
- через объект системы определяет, какой runtime param надо менять;
- строит последовательность значений;
- запускает один и тот же research run на каждой комбинации;
- возвращает весь список результатов в памяти.

Сейчас поддерживаются target:

- `module.period`
- `system.lower_threshold`
- `system.upper_threshold`

## Frontend-архитектура

В `Research`-табе пользователь сейчас задает:

### Dataset

- symbol
- timeframe
- start
- end

### System

- `System`
- `Position mode`
- дополнительные системные параметры

Сейчас дополнительные системные параметры есть у:

- `oscillator_threshold`
  - `lower_threshold`
  - `upper_threshold`

### Server module

- `Server module`
- `Module period`

### Execution

- `fee_bps`
- `slippage_bps`

### Optimization

- enabled / disabled
- optimization target
- `from`
- `to`
- `step`

## Формат API запроса

Текущий запрос:

```json
{
  "symbol": "BTCUSD",
  "timeframe": "1h",
  "start_time": "2026-01-01T00:00:00Z",
  "end_time": "2026-02-01T00:00:00Z",
  "system": {
    "type": "oscillator_threshold",
    "params": {
      "position_mode": "long_short",
      "lower_threshold": 30,
      "upper_threshold": 70
    }
  },
  "module": {
    "type": "rsi",
    "params": {
      "period": 14
    }
  },
  "execution": {
    "fee_bps": 4,
    "slippage_bps": 2
  },
  "optimization": {
    "enabled": true,
    "target": "system.lower_threshold",
    "from": 25,
    "to": 35,
    "step": 5
  }
}
```

## Формат API ответа

Сейчас сервер возвращает:

```json
{
  "strategy": "rsi_threshold",
  "system": {
    "type": "oscillator_threshold",
    "params": {
      "position_mode": "long_short",
      "lower_threshold": 30,
      "upper_threshold": 70
    }
  },
  "module": {
    "type": "rsi",
    "params": {
      "period": 14
    }
  },
  "dataset": {
    "symbol": "BTCUSD",
    "timeframe": "1h",
    "start_time": "2026-01-01T00:00:00Z",
    "end_time": "2026-02-01T00:00:00Z"
  },
  "optimization": {
    "enabled": true,
    "param": "system.lower_threshold",
    "from": 25,
    "to": 35,
    "step": 5
  },
  "runs": [
    {
      "params": {
        "system_type": "oscillator_threshold",
        "module_type": "rsi",
        "module_period": 14,
        "position_mode": "long_short",
        "lower_threshold": 25.0,
        "upper_threshold": 70.0
      },
      "trades": [
        {
          "entryTime": 1704067200,
          "entryPrice": 42100.0,
          "exitTime": 1704153600,
          "exitPrice": 42520.0,
          "direction": "long",
          "pnl": 420.0,
          "pnlPercent": 0.998,
          "bars": 24
        }
      ]
    }
  ]
}
```

## Что считается на фронтенде

Сервер сейчас возвращает именно `trades`.

Фронтенд сам считает:

- equity curve;
- статистику;
- отображение метрик.

Это сделано специально, чтобы `Research` и Fast Lab использовали один и тот же набор метрик и один и тот же код отображения.

## Что сейчас не реализовано

На текущем этапе **не реализованы**:

- YAML DSL;
- сохранение runs в БД;
- сохранение optimization history;
- сохранение результатов в файлы;
- server-side statistics persistence;
- generic module registry как отдельная сущность;
- визуальный DSL editor;
- multi-module system graph;
- portfolio mode;
- walk-forward manager;
- Monte Carlo;
- genetic optimization;
- Bayesian optimization.

## Что важно про текущее состояние

Текущая реализация это уже **рабочий server-side vertical slice**, а не прототип на клиенте.

Главные свойства текущего состояния:

- Fast Lab не переписывался;
- Research живет отдельно;
- сервер реально считает модули;
- сервер реально делает optimization;
- UI уже показывает результат как отдельный research workflow;
- архитектура уже умеет различать:
  - тип системы;
  - тип серверного модуля;
  - параметры системы;
  - параметры модуля.

## Тесты

Сейчас исследовательский контур покрыт:

- frontend тестами общего UI;
- request specs для `/api/research/run`;
- service specs для `Executor`;
- service specs для `Optimizer`.

Ключевые файлы:

- `spec/requests/api/research_spec.rb`
- `spec/services/research/executor_spec.rb`
- `spec/services/research/optimizer_spec.rb`

## Практический итог

На текущем этапе `Research` это:

- отдельный UI-таб;
- server-side run;
- server-side optimization;
- `EMA` как price-scale module;
- `RSI` как oscillator module;
- единый просмотр runs, equity, trades и статистики.

Это и есть текущая рабочая база, от которой дальше можно идти к:

- новым server modules;
- более общему DSL;
- более общим system types;
- сохранению выбранных runs;
- более сложной оптимизации.
