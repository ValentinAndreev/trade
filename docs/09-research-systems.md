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

Дополнительные shared-типы модулей:

| Тип | Описание | Ключевые параметры |
| --- | --- | --- |
| `external_series` | Macro/on-chain series из `macro_series` | `key` |
| `ml_signal` | Предсказание обученной ML-модели | `model_key`, `output` |

Pure-Ruby native-модули состояния, риска и нормализации доступны через тот же каталог Research-модулей и не проходят через `TechnicalAnalysis` gem:

| Тип | Назначение | Ключевые параметры |
| --- | --- | --- |
| `log_return` | Лог-доходность close к close `N` баров назад | `period` |
| `rolling_volatility` | Rolling volatility по прошлым и текущим барам | `period` |
| `range_position` | Позиция close внутри rolling high/low range, `[0, 1]` | `period` |
| `rolling_zscore` | Rolling z-score | `period` |
| `percentile_rank` | Percentile rank в rolling окне | `period` |
| `trend_regime_score` | Нормализованная эвристика силы тренда `[-1, 1]` | `period` |
| `vol_regime_score` | Эвристика режима волатильности `[0, 1]` | `short_period`, `long_period` |
| `vol_adjust` | Значение, деленное на rolling volatility с epsilon guard | `field`, `period`, `epsilon` |
| `lag` | Значение входной series N баров назад | `input`, `period` |
| `delta` | Разница текущего input и lagged input | `input`, `period` |
| `rolling_mean` | Среднее trailing window по input | `input`, `period` |
| `rolling_std` | Population stddev trailing window по input | `input`, `period` |
| `ema_smoother` | EMA trailing window по input | `input`, `period` |
| `clip` | Clamp input к фиксированным bounds | `input`, `min_value`, `max_value` |
| `winsorize` | Clamp input к trailing quantile bounds | `input`, `period`, `lower_quantile`, `upper_quantile` |
| `zscore` | Z-score input относительно trailing window | `input`, `period` |
| `robust_zscore` | Median/MAD z-score input относительно trailing window | `input`, `period`, `epsilon` |
| `minmax_position` | Позиция input внутри trailing min/max range | `input`, `period` |
| `spread` | Разница двух aligned inputs | `left`, `right` |
| `ratio` | Отношение двух aligned inputs | `left`, `right`, `epsilon` |
| `rolling_corr` | Pearson correlation двух aligned inputs | `left`, `right`, `period` |
| `stationarity_proxy` | Bounded drift heuristic между соседними rolling means | `input`, `period`, `epsilon` |
| `heteroskedasticity_proxy` | Bounded variance-change heuristic между соседними windows | `input`, `period`, `epsilon` |

Для ML feature specs эти модули публикуют метаданные: `module_version`, `definition_checksum`, `output_fields`, `warmup`, `lookahead`, описание и формулу/эвристику. Модули без полных метаданных `warmup`/`lookahead` не допускаются в ML feature specs.

`stationarity_proxy` и `heteroskedasticity_proxy` — lightweight heuristics, не статистические ADF/KPSS/Levene/Breusch-Pagan tests:

```text
stationarity_proxy =
  1 - clamp(abs(mean(current_window) - mean(previous_window)) /
            (stddev_pop(combined_window) + epsilon), 0, 1)

heteroskedasticity_proxy =
  clamp(abs(var_pop(current_window) - var_pop(previous_window)) /
        (var_pop(combined_window) + epsilon), 0, 1)
```

### Input references

Transform-like native modules используют canonical input-ref schema:

```yaml
modules:
  basis:
    type: rolling_mean
    input:
      kind: ohlcv
      field: close
    period: 20
  spread_to_basis:
    type: spread
    left:
      kind: ohlcv
      field: close
    right:
      kind: module
      module_ref: basis
      output: value
```

Поддерживаемые refs:

| Kind | Shape | Описание |
| --- | --- | --- |
| `ohlcv` | `{ kind: "ohlcv", field: "close" }` | Поле текущей candle series |
| `module` | `{ kind: "module", module_ref: "basis", output: "value" }` | Output ранее объявленного module key |
| `external_series` | `{ kind: "external_series", key: "vix", output: "value" }` | Macro/on-chain series с last-known-at-or-before alignment |

Refs scoped к текущему `(exchange, symbol, timeframe)`. YAML validation отклоняет `exchange`, `symbol` или `timeframe` внутри input refs; cross-symbol/cross-timeframe feature engineering требует отдельного будущего контракта. `external_series` использует timestamp строки как availability timestamp, без future fill и interpolation; до первой известной точки значение `nil`.

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

## ML-сигналы как модули

`ml_signal` подключает обученную ML-модель как series, выровненную по свечам. Значение доступно в условиях как `<alias>.value`, как и у обычных индикаторов.

Пример:

```yaml
id: ml_direction_filter
name: ML Direction Filter

modules:
  direction:
    type: ml_signal
    model_key: btc_direction_v1
    output: probability

params:
  position_mode: long_only
  upper_threshold: 0.65

conditions:
  long_entry: "direction.value > params.upper_threshold"
  long_exit: "direction.value < 0.5"
```

Параметры:

| Параметр | Обязателен | Значения |
| --- | --- | --- |
| `model_key` | Да | key существующей обученной ML-модели |
| `output` | Нет | `probability`, `confidence`; по умолчанию `probability` |

Валидация YAML отклоняет:

- неизвестный `model_key`;
- модель без serving-состояния `trained`;
- неподдерживаемый `output`;
- модель, обученную для другого `symbol`, `exchange` или `timeframe`, если эти данные известны в запросе запуска;
- feature spec модели с положительным `lookahead`;
- feature spec модели без обязательных ML-метаданных (`module_version`, `definition_checksum`, `output_fields`, `warmup`, `lookahead`).

Backtest/optimization дополнительно повторно валидируют YAML после постановки в очередь и перед исполнением, чтобы изменение состояния модели между валидацией в редакторе и запуском не использовало устаревший validation state.

### Инференс и повторное использование

`ml_signal` вызывает `Ml::InferenceService`. Сервис в начале операции фиксирует неизменяемый serving snapshot:

- `training_run_id`
- `weight_checksum`
- `weights_payload`
- `resolved_feature_spec`
- `fitted_metadata`

Этот snapshot используется для всех batch-вызовов внутри операции, даже если параллельно завершилось новое обучение.

Предсказания сохраняются в `ml_predictions` и переиспользуются только при совпадении:

- serving `weight_checksum`;
- `source_window_checksum`, посчитанного по стабильному содержимому свечей в effective warmup window.

Если строки отсутствуют или stale, inference вычисляет их батчами, сохраняет успешный batch и только после commit возвращает значения вызывающей стороне Research. Ошибки adapter/persistence не пишутся как rows в `ml_predictions`; backtest получает структурированную ошибку, а optimization помечает конкретный parameter run как failed с diagnostics и продолжает остальные значения.

### No-lookahead и labels

Inference features для временной метки `t` используют только свечи `<= t`. Training labels могут смотреть вперед только внутри dataset builder. Direction-classification label строится по close-to-close simple return через `label_horizon`: `up`, если будущая доходность выше `label_deadband_return`, `down`, если ниже отрицательного deadband, и без label внутри deadband.

Строки без достаточной history для feature warmup возвращают `nil` prediction values; значения не фабрикуются.

### Лимит range inference

MVP-лимит для inference:

```text
prediction_cells = candle_count * distinct(model_key)
max_prediction_cells = 50_000
```

Текущий inference contract принимает один `(exchange, symbol, timeframe)` tuple. Multi-tuple inference должен получить отдельный контракт.

## Как это исполняется

Поток выполнения:

```text
POST /api/research/run
  -> Research::RunRequest
  -> Research::Systems::Validation::Validator
  -> Research::Systems::Definition (compiled)
  -> повторная проверка модели для ml_signal, если YAML ссылается на ML
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
- строит series для каждого alias модуля через `Research::Modules.for(type)` (включая `external_series` для macro/on-chain данных и `ml_signal` для ML inference);
- кэширует результаты модулей по паре `module_type + params` внутри одного экземпляра `Backtest`;
- симулирует сделки по `conditions` через `Research::Runtime::RowCursor`.

Несколько alias одного типа работают независимо на уровне сигналов, но переиспользуют вычисления если параметры совпадают.

Research cancellation передается в ML inference: при отмене run ожидающие ML-batches останавливаются на ближайшем deterministic checkpoint.

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
│   ├── base.rb                   # Base class для TechnicalAnalysis-backed модулей
│   ├── native.rb                 # Base class для pure-Ruby native модулей
│   ├── input_resolver.rb          # Canonical input refs для transform-like native модулей
│   ├── external_series.rb        # Macro/on-chain series
│   └── ml_signal.rb              # ML prediction series
├── systems/
│   ├── catalog.rb
│   ├── definition.rb             # Compiled system — разрешение ссылок, run_params
│   ├── editor_metadata.rb
│   ├── path_helpers.rb
│   ├── repository.rb
│   ├── schema.rb
│   ├── condition_expression/     # Parser и AST для условий
│   └── validation/               # Validator и sub-validators, включая ML model checks
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

Если модуль должен быть доступен для ML feature specs, добавьте метаданные в `IndicatorsConfig`: `module_version`, `definition_checksum`, `output_fields`, `warmup`, `lookahead`, описание и формулу/эвристику. Pure-Ruby modules должны идти через native path или явно реализованный `call`; они не должны случайно попадать в `Research::Modules::Base#ta_class`.
