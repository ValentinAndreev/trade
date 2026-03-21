# Research Systems

## Назначение

Research — серверный режим бэктестинга и оптимизации торговых систем.
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

Поддерживаемые типы:

| Тип | Параметры |
| --- | --- |
| `ema` | `period` |
| `rsi` | `period` |

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
- ссылки на модули: `<alias>.value`;
- ссылки на параметры: `params.<key>`;
- числа;
- операторы `>>`, `<<`, `>`, `>=`, `<`, `<=`, `&&`, `||`.

Пример:

```yaml
conditions:
  long_entry: "(ema_fast.value >> ema_slow.value) && (rsi_filter.value < params.upper_threshold)"
  long_exit: "ema_fast.value << ema_slow.value"
```

Семантика операторов:

- `>>` — cross above;
- `<<` — cross below;
- `&&` — логическое И;
- `||` — логическое ИЛИ.

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

Если секция не задана, по умолчанию используется первый параметр первого модуля.

## Как это исполняется

Поток выполнения:

```text
POST /api/research/run
  -> Research::RunRequest
  -> Research::Dsl::Catalog.validate
  -> Research::System
  -> Research::Backtest
  -> Research::Optimizer
  -> Research::ProgressBroadcaster
```

### Research::System

Отвечает за:

- нормализацию `modules`;
- формирование runtime-параметров вида `ema_fast_period`;
- разрешение ссылок вроде `ema_fast.value`;
- mapping optimization target `ema_fast.period -> ema_fast_period`.

### Research::Backtest

`Backtest`:

- загружает свечи через `Candle::FindQuery`;
- строит series для каждого alias модуля;
- кэширует результаты по паре `module_type + params`;
- симулирует сделки по `conditions`.

Несколько alias одного типа работают независимо на уровне сигналов, но могут переиспользовать вычисления, если параметры совпадают.

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
├── system.rb
├── backtest.rb
├── optimizer.rb
├── run_request.rb
├── signal_evaluator.rb
├── modules/
│   ├── base.rb
│   ├── ema.rb
│   └── rsi.rb
└── dsl/
    ├── catalog.rb
    ├── validator.rb
    └── validators/
        ├── structure.rb
        ├── conditions.rb
        └── optimization.rb
```

Примеры систем:

```text
config/research/systems/examples/
├── price_ema_cross.yml
├── rsi_threshold.yml
├── ema_rsi_combo.yml
└── ema_fast_slow_cross.yml
```

## Как добавить новый тип модуля

1. Добавить класс в `app/services/research/modules/`.
2. Зарегистрировать его в `Research::Backtest::MODULES`.
3. Добавить тип и параметры в `config/research/dictionary.yml`.

После этого его можно использовать в YAML так:

```yaml
modules:
  my_alias:
    type: sma
    period: 50
```
