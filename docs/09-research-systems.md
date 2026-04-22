# Research Systems

## Назначение

Research — серверный режим бэктестинга и оптимизации торговых систем. В интерфейсе соответствующий таб называется **Test/Optimization**.
Система описывается в YAML DSL, валидируется на сервере и исполняется через `Research::Backtest`.

Ключевые возможности:

- YAML DSL для торговых систем;
- несколько модульных инстансов в одной системе;
- серверный расчёт индикаторов;
- бэктест с комиссиями и проскальзыванием;
- оптимизация параметров по диапазону;
- realtime-прогресс через ActionCable.

## YAML DSL

Каждая система хранится в `config/research/systems/**/*.yml`.

### Базовый пример

```yaml
id: price_ema_cross
name: Price / EMA Cross

modules:
  ema:
    type: ema
    period: 20

params:
  position_mode: long_short

conditions:
  long_entry: "close >> ema.value"
  long_exit: "close << ema.value"
  short_entry: "close << ema.value"
  short_exit: "close >> ema.value"

optimization:
  targets:
    - ema.period
```

### Пример с несколькими инстансами одного типа

```yaml
id: ema_fast_slow_cross
name: EMA Fast / Slow Cross

modules:
  ema_fast:
    type: ema
    period: 10
  ema_slow:
    type: ema
    period: 20

params:
  position_mode: long_short

conditions:
  long_entry: "ema_fast.value >> ema_slow.value"
  long_exit: "ema_fast.value << ema_slow.value"
  short_entry: "ema_fast.value << ema_slow.value"
  short_exit: "ema_fast.value >> ema_slow.value"

optimization:
  targets:
    - ema_fast.period
    - ema_slow.period
```

## Структура

### Корневые ключи

| Ключ | Обязателен | Описание |
| --- | --- | --- |
| `id` | Да | Идентификатор системы |
| `name` | Да | Человекочитаемое имя |
| `modules` | Да | Набор модульных инстансов |
| `params` | Нет | Дополнительные runtime-параметры |
| `conditions` | Да | Условия входа и выхода |
| `optimization` | Нет | Доступные targets оптимизации |

### modules

`modules` — это mapping вида `alias -> config`.

Правила:

- ключ — это alias модуля внутри системы, например `ema_fast`;
- `type` обязателен для каждого alias;
- остальные ключи — параметры выбранного типа;
- один и тот же `type` можно использовать несколько раз с разными alias.

Пример:

```yaml
modules:
  ema_fast:
    type: ema
    period: 10
  ema_slow:
    type: ema
    period: 20
  rsi_filter:
    type: rsi
    period: 14
```

Поддерживаемые типы (из `config/configs/indicators_config.rb`):

| Тип | Описание | Ключевые параметры |
| --- | --- | --- |
| `adi` | Accumulation/Distribution Index | — |
| `adtv` | Average Daily Trading Volume | `period` |
| `adx` | Average Directional Index | `period` |
| `ao` | Awesome Oscillator | `short_period`, `long_period` |
| `atr` | Average True Range | `period` |
| `bb` | Bollinger Bands | `period`, `standard_deviations` |
| `cci` | Commodity Channel Index | `period`, `constant` |
| `cmf` | Chaikin Money Flow | `period` |
| `cr` | Cumulative Return | — |
| `dc` | Donchian Channel | `period` |
| `dlr` | Daily Log Return | — |
| `dpo` | Detrended Price Oscillator | `period` |
| `dr` | Daily Return | — |
| `ema` | Exponential Moving Average | `period` |
| `eom` | Ease of Movement | `period` |
| `fi` | Force Index | — |
| `ichimoku` | Ichimoku Kinko Hyo | `low_period`, `medium_period`, `high_period` |
| `kc` | Keltner Channel | `period` |
| `kst` | Know Sure Thing | `period`, `roc1`–`roc4`, `sma1`–`sma4` |
| `macd` | MACD | `fast_period`, `slow_period`, `signal_period` |
| `mfi` | Money Flow Index | `period` |
| `mi` | Mass Index | `ema_period`, `sum_period` |
| `nvi` | Negative Volume Index | — |
| `obv` | On-balance Volume | — |
| `obv_mean` | On-balance Volume Mean | `period` |
| `rsi` | Relative Strength Index | `period` |
| `sma` | Simple Moving Average | `period` |
| `sr` | Stochastic Oscillator | `period`, `signal_period` |
| `trix` | Triple Exponential Average | `period` |
| `tsi` | True Strength Index | `low_period`, `high_period` |
| `uo` | Ultimate Oscillator | `short_period`, `medium_period`, `long_period`, weights |
| `vi` | Vortex Indicator | `period` |
| `vpt` | Volume-price Trend | — |
| `vwap` | Volume Weighted Average Price | — |
| `wma` | Weighted Moving Average | `period` |
| `wr` | Williams %R | `period` |

Результат модуля в условиях доступен как `<alias>.value`.

Примеры:

- `ema_fast.value`
- `ema_slow.value`
- `rsi_filter.value`

### params

Дополнительные параметры системы:

```yaml
params:
  position_mode: long_short
  lower_threshold: 30
  upper_threshold: 70
```

Поддерживаемые параметры:

| Параметр | Тип | Значения |
| --- | --- | --- |
| `position_mode` | enum | `long_short`, `long_only`, `short_only` |
| `lower_threshold` | number | любое число |
| `upper_threshold` | number | любое число |

В условиях на них ссылаются через `params.<key>`.

### conditions

Условия задаются строковыми выражениями. Поддерживаются:

- поля свечи: `open`, `high`, `low`, `close`, `volume`;
- ссылки на модули: `<alias>.value` (включая `external_series` для macro/on-chain данных);
- ссылки на параметры: `params.<key>`;
- числа;
- операторы `>>`, `<<`, `>`, `>=`, `<`, `<=`, `&&`, `||`, `+`, `-`, `*`, `/`;
- функции `abs()`, `min()`, `max()`, `prev()`, `offset()`;
- круглые скобки для группировки.

Пример:

```yaml
conditions:
  long_entry: "(ema_fast.value >> ema_slow.value) && (rsi_filter.value < params.upper_threshold)"
  long_exit: "ema_fast.value << ema_slow.value"
```

Пример с арифметикой и history helpers:

```yaml
conditions:
  long_entry: "close > max(prev(close), offset(close, 2))"
  long_exit: "abs(close - ema_fast.value) < 20"
  short_entry: "ema_fast.value < min(prev(ema_fast.value), ema_slow.value)"
  short_exit: "close > prev(close)"
```

Семантика операторов:

- `>>` — cross above;
- `<<` — cross below;
- `&&` — логическое И;
- `||` — логическое ИЛИ.

Арифметика:

- `+`, `-`, `*`, `/` работают внутри числовых выражений;
- приоритет стандартный: сначала unary `-`, затем `*`/`/`, затем `+`/`-`, затем сравнения, затем `&&`/`||`;
- корень условия должен быть boolean-выражением, например `close > ema.value + 10`, а не просто `close + ema.value`.

Функции:

| Функция | Аргументы | Описание |
| --- | --- | --- |
| `abs(x)` | 1 | Модуль значения |
| `min(a, b, ...)` | 2+ | Минимум из аргументов |
| `max(a, b, ...)` | 2+ | Максимум из аргументов |
| `prev(x)` | 1 | Значение выражения на 1 бар назад |
| `offset(x, n)` | 2 | Значение выражения на `n` баров назад, где `n` — положительный integer literal |

Полезные примеры:

- `ema_fast.value >> ema_slow.value - 100`
- `abs(close - ema.value) > 50`
- `close > prev(close)`
- `close > max(prev(close), offset(close, 2))`
- `rsi_filter.value < min(params.upper_threshold, 25)`
- `fear_greed_mod.value < 30`
- `(ema.value >> close) && (vix_mod.value > 25)`

### Пример с макро-данными

```yaml
id: sentiment_trend_hybrid
name: Sentiment + Trend Hybrid

modules:
  ema:
    type: ema
    period: 20
  fear_greed_mod:
    type: external_series
    key: fear_greed

params:
  position_mode: long_short
  lower_threshold: 30
  upper_threshold: 70

conditions:
  long_entry: "(close >> ema.value) && (fear_greed_mod.value < params.lower_threshold)"
  long_exit: "(close << ema.value) || (fear_greed_mod.value > params.upper_threshold)"
  short_entry: "(close << ema.value) && (fear_greed_mod.value > params.upper_threshold)"
  short_exit: "(close >> ema.value) || (fear_greed_mod.value < params.lower_threshold)"
```

Внешние данные берутся из `macro_series` (TimescaleDB) с применением LOCF (last observation carried forward) для сопоставления с минутными свечами. Если данные за период не загружены, значение будет `nil` и условие вернет `false`.

Ограничения и поведение:

- `prev()` и `offset()` работают только по прошлым барам, вперёд смотреть нельзя;
- если на ранних барах история ещё недоступна, выражение даёт `nil`, а итоговое сравнение становится `false`;
- деление на ноль не выбрасывает exception, а приводит к `false` на уровне сравнения;
- `offset()` принимает только literal вроде `offset(close, 3)`, а не динамическое `offset(close, params.lookback)`.

### optimization

`optimization.targets` задаёт список параметров, доступных для перебора.

Пример:

```yaml
optimization:
  targets:
    - ema_fast.period
    - ema_slow.period
    - params.lower_threshold
```

Поддерживаются:

- `<alias>.<param>`;
- `params.<key>`.

Если секция не задана, система выбирает первый числовой (`integer` / `number`) параметр первого модуля. Если у модулей нет числовых параметров (например, `external_series` без собственных числовых параметров), fallback — первый числовой system-param (`params.upper_threshold` и т.п.).

## Внешние серии как модули

Все внешние данные (macro и on-chain), синкнутые в `macro_series`, подключаются через модуль `external_series`. `source` можно не указывать — он подставляется автоматически из каталога по `key`.

```yaml
modules:
  mvrv:
    type: external_series
    key: mvrv_ratio
  mvrv_z:
    type: external_series
    key: mvrv_z_score

params:
  position_mode: long_only
  lower_threshold: 1.0
  upper_threshold: 7.0

conditions:
  long_entry: "(mvrv.value < params.lower_threshold) || (mvrv_z.value < 0)"
  long_exit: "mvrv_z.value > params.upper_threshold"
```

On-chain метрики (`mvrv_ratio`, `mvrv_z_score`, `nupl`, `realized_price`) вычисляются из Coin Metrics Community API при синке:

| Indicator | Source | Расчет |
| --- | --- | --- |
| `mvrv_ratio` | Coin Metrics `CapMVRVCur` | готовая community-метрика |
| `mvrv_z_score` | Coin Metrics `CapMrktCurUSD`, `CapMVRVCur` | `(CapMrktCurUSD - CapMrktCurUSD / CapMVRVCur) / cumulative_std(CapMrktCurUSD)` |
| `nupl` | Coin Metrics `CapMVRVCur` | `1 - 1 / CapMVRVCur` |
| `realized_price` | Coin Metrics `CapMrktCurUSD`, `CapMVRVCur`, `SplyCur` | `(CapMrktCurUSD / CapMVRVCur) / SplyCur` |

## Как это исполняется

Поток выполнения:

```text
POST /api/research/run
  -> Research::RunRequest
  -> Research::Systems::Validation::Validator
  -> Research::Systems::Definition (compiled)
  -> Research::Backtest
  -> Research::Optimizer
  -> Research::ProgressBroadcaster
```

### Research::Systems::Definition

Отвечает за:

- нормализацию `modules`;
- формирование runtime-параметров вида `ema_fast_period`;
- разрешение ссылок вроде `ema_fast.value`, `params.threshold`;
- mapping optimization target `ema_fast.period -> ema_fast_period`.

### Research::Backtest

`Backtest`:

- загружает свечи через `Candle::FindQuery`;
- строит series для каждого alias модуля через `Research::Modules.for(type)` (включая `external_series` для macro/on-chain данных);
- кэширует результаты модулей по паре `module_type + params` внутри одного экземпляра `Backtest`;
- симулирует сделки по `conditions` через `Research::Runtime::RowCursor`.

Несколько alias одного типа работают независимо на уровне сигналов, но переиспользуют вычисления если параметры совпадают.

## API

Основные endpoints:

| Method | Path | Назначение |
| --- | --- | --- |
| `GET` | `/api/research/catalog` | Список YAML-систем |
| `GET` | `/api/research/dictionary` | Токены DSL для editor UI |
| `POST` | `/api/research/validate` | Валидация YAML |
| `POST` | `/api/research/run` | Запуск бэктеста/оптимизации |
| `POST` | `/api/research/cancel` | Отмена текущего run |

Пример фрагмента ответа `/api/research/validate`:

```json
{
  "ok": true,
  "system": {
    "id": "ema_fast_slow_cross",
    "name": "EMA Fast / Slow Cross",
    "modules": {
      "ema_fast": { "type": "ema", "period": 10 },
      "ema_slow": { "type": "ema", "period": 20 }
    },
    "optimization_targets": [
      { "value": "ema_fast.period", "label": "Ema Fast EMA period" },
      { "value": "ema_slow.period", "label": "Ema Slow EMA period" }
    ]
  }
}
```

## Файлы

Основные backend-файлы:

```text
app/services/research/
├── backtest.rb
├── optimizer.rb
├── run_request.rb
├── cancellation_registry.rb
├── progress_broadcaster.rb
├── modules.rb                    # Research::Modules.for(type)
├── modules/
│   └── base.rb                   # Base class (делегирует в TechnicalAnalysis gem)
├── systems/
│   ├── catalog.rb
│   ├── definition.rb             # Compiled system — разрешение ссылок, run_params
│   ├── editor_metadata.rb
│   ├── path_helpers.rb
│   ├── repository.rb
│   ├── schema.rb
│   ├── condition_expression/     # Parser и AST для условий
│   └── validation/               # Validator и sub-validators
└── runtime/
    ├── row_cursor.rb             # Курсор по свечам с доступом к модулям и макро
    └── signal_evaluator.rb       # Вычисление условий по AST
```

Примеры систем и конфигурация:

```text
config/research/
├── dictionary.yml                # Структурные правила DSL (condition keys, references, optimization)
└── systems/
    ├── examples/
    │   ├── price_ema_cross.yml
    │   ├── rsi_threshold.yml
    │   ├── ema_rsi_combo.yml
    │   ├── ema_fast_slow_cross.yml
    │   ├── history_breakout.yml
    │   ├── midpoint_filter.yml
    │   └── ema_distance_reversion.yml
    └── sentiment_trend_hybrid.yml
```

## Как добавить новый тип модуля

1. Добавить класс в `app/services/research/modules/`, наследующий `Research::Modules::Base` и реализующий `def call(**params)`. `Research::Modules.for(type)` найдёт класс автоматически по имени константы.

2. Добавить запись в `IndicatorsConfig::INDICATORS` (`config/configs/indicators_config.rb`):

```ruby
my_indicator: {
  label: 'My Indicator',
  params: { period: integer(label: 'Period', min: 1) }
},
```

3. Добавить LLM-описание в `app/prompts/llm/system_editor/modules_meta.yml`:

```yaml
my_indicator:
  label: My Indicator
  description: Что делает индикатор.
  output: value
  params:
    period: Lookback period.
```

После этого модуль доступен в YAML систем:

```yaml
modules:
  sig:
    type: my_indicator
    period: 14
conditions:
  long_entry: "sig.value > 0"
```
