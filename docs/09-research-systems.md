# Research Systems

## Назначение

Research — серверный режим бэктестинга и оптимизации торговых систем. Системы описываются в YAML, валидируются, компилируются и запускаются на сервере. Результаты отображаются в отдельном UI-табе.

Ключевые возможности:

- описание торговых систем в YAML DSL;
- визуальный YAML-редактор с валидацией в реальном времени;
- серверный расчет индикаторов (EMA, RSI);
- серверный бэктест с учётом комиссий и проскальзывания;
- оптимизация параметров по диапазону;
- realtime-прогресс через ActionCable;
- отображение equity, статистики, сделок и графика оптимизации.

## YAML DSL

Каждая система — один `.yml` файл в `config/research/systems/`. Поддерживаются вложенные директории.

### Структура файла

```yaml
id: price_ema_cross
name: Price / EMA Cross

module:
  type: ema
  params:
    period: 20

params:
  position_mode: long_short

conditions:
  long_entry:
    operator: cross_above
    left: close
    right: module.value
  long_exit:
    operator: cross_below
    left: close
    right: module.value
  short_entry:
    operator: cross_below
    left: close
    right: module.value
  short_exit:
    operator: cross_above
    left: close
    right: module.value

optimization:
  targets:
    - module.period
```

### Корневые ключи

| Ключ | Обязателен | Описание |
| --- | --- | --- |
| `id` | Да | Уникальный идентификатор системы. Совпадает с именем файла |
| `name` | Да | Человекочитаемое название |
| `module` | Да | Серверный индикатор |
| `params` | Нет | Дополнительные параметры системы |
| `conditions` | Да | Условия входа и выхода |
| `optimization` | Нет | Цели оптимизации |

### module

Описывает серверный индикатор, на базе которого работает система.

```yaml
module:
  type: ema       # или rsi
  params:
    period: 20
```

Доступные модули:

| Тип | Описание | Параметры |
| --- | --- | --- |
| `ema` | Exponential Moving Average | `period` (integer, >= 1) |
| `rsi` | Relative Strength Index | `period` (integer, >= 1) |

Модуль возвращает ряд `{ time, result: { value } }`. В условиях результат доступен как `module.value`.

### params

Дополнительные параметры, которые можно использовать в условиях и оптимизации.

```yaml
params:
  position_mode: long_short
  lower_threshold: 30
  upper_threshold: 70
```

Доступные параметры:

| Параметр | Тип | Значения | Описание |
| --- | --- | --- | --- |
| `position_mode` | enum | `long_short`, `long_only`, `short_only` | Режим позиций |
| `lower_threshold` | number | любое | Нижний порог |
| `upper_threshold` | number | любое | Верхний порог |

В условиях параметры доступны через `params.lower_threshold`, `params.upper_threshold`.

### conditions

Условия входа и выхода из позиции. Обязательно хотя бы одно из `long_entry` или `short_entry`.

```yaml
conditions:
  long_entry:
    operator: cross_above
    left: close
    right: module.value
  long_exit:
    operator: cross_below
    left: close
    right: module.value
```

Допустимые имена условий: `long_entry`, `long_exit`, `short_entry`, `short_exit`.

#### Операторы

| Оператор | Описание |
| --- | --- |
| `gt` | Больше |
| `gte` | Больше или равно |
| `lt` | Меньше |
| `lte` | Меньше или равно |
| `cross_above` | Пересечение снизу вверх (left <= right на предыдущем баре и left > right на текущем) |
| `cross_below` | Пересечение сверху вниз (left >= right на предыдущем баре и left < right на текущем) |

#### Операнды (left / right)

Каждый операнд может быть:

| Тип | Синтаксис | Примеры |
| --- | --- | --- |
| Поле свечи | имя поля | `open`, `high`, `low`, `close`, `volume` |
| Результат модуля | `module.value` | `module.value` |
| Параметр системы | `params.<key>` | `params.lower_threshold` |
| Числовая константа | число | `30`, `70.5` |

#### Пример: RSI с порогами

```yaml
conditions:
  long_entry:
    operator: cross_below
    left: module.value
    right: params.lower_threshold
  long_exit:
    operator: cross_above
    left: module.value
    right: params.upper_threshold
  short_entry:
    operator: cross_above
    left: module.value
    right: params.upper_threshold
  short_exit:
    operator: cross_below
    left: module.value
    right: params.lower_threshold
```

### optimization

Определяет, какие параметры можно оптимизировать. Если секция не задана, по умолчанию доступен `module.period`.

```yaml
optimization:
  targets:
    - module.period
    - params.lower_threshold
    - params.upper_threshold
```

Допустимые цели:

- `module.period` — период индикатора;
- `params.<key>` — любой определённый в `params` параметр.

## Каталог систем

Системы хранятся в файловой системе:

```
config/research/
├── dictionary.yml                  # Словарь DSL
└── systems/
    ├── price_ema_cross.yml
    ├── rsi_threshold.yml
    └── strategies/                 # Поддержка вложенных директорий
        └── custom_system.yml
```

Каталог управляется через `Research::Dsl::Catalog`. API позволяет:

- получить список систем и директорий;
- создавать, переименовывать и удалять системы;
- создавать, переименовывать и удалять директории.

## Словарь (dictionary.yml)

Словарь задаёт допустимые ключи, типы модулей, параметры и операторы. Валидатор и компилятор используют его как единственный источник правил.

Файл: `config/research/dictionary.yml`

Секции:

- `root_keys` — допустимые корневые ключи YAML;
- `module.types` — доступные модули с их параметрами;
- `params` — доступные параметры системы с типами;
- `conditions.operators` — допустимые операторы;
- `conditions.keys` — допустимые имена условий;
- `references.fields` — поля свечи для использования в операндах;
- `references.module` — ссылки на результат модуля;
- `optimization.keys` — ключи секции оптимизации.

Чтобы добавить новый параметр или оператор, достаточно отредактировать `dictionary.yml`.

## Валидация

Валидация выполняется классом `Research::Dsl::Validator`, который разбит на три модуля по назначению:

| Модуль | Что проверяет |
| --- | --- |
| `Validators::Structure` | Обязательные ключи, структура `module` и `params`, типы скалярных значений |
| `Validators::Conditions` | Структура `conditions`, операторы, операнды, наличие entry-условий |
| `Validators::Optimization` | Структура `optimization`, валидность target-ссылок |

Общая инфраструктура (парсинг YAML, запись ошибок, type helpers, SourceMap для позиций в редакторе) остаётся в `Validator`.

Каждая ошибка возвращается как `Diagnostic` с привязкой к строке и колонке в исходном YAML:

```ruby
Diagnostic.new(
  message: "Unsupported operator: eq",
  line: 12,
  column: 15,
  length: 2,
  path: "conditions.long_entry.operator",
  code: "condition_operator"
)
```

Это позволяет YAML-редактору во фронтенде подсвечивать ошибки прямо в тексте.

## Компиляция

После успешной валидации `Research::Dsl::Compiler` превращает YAML-payload в объект `Research::System`:

- операнды компилируются в структуры `{ kind: :bar, key: :close }`, `{ kind: :module, key: :value }`, `{ kind: :literal, value: 30.0 }`;
- runtime-параметры собираются из `module.params.period` + `params`;
- цели оптимизации получают человекочитаемые метки из словаря.

## Backend-архитектура

### Поток выполнения

```
HTTP POST /api/research/run
  → RunRequest              # парсинг и валидация payload
      → Catalog.validate    # валидация YAML
      → Compiler.compile    # компиляция → Research::System
  → Executor                # загрузка свечей, расчёт модуля
      → Modules::Ema / Rsi  # расчёт индикатора
      → System.signals_for  # вычисление сигналов на каждом баре
      → BacktestEngine      # симуляция торговли → сделки
  → Optimizer               # если включена оптимизация — повтор Executor по диапазону
  → ProgressBroadcaster     # realtime-прогресс через ActionCable
```

### Классы

#### Research::System

Объект торговой системы, готовый к выполнению. `Compiler` разбирает YAML-payload и создаёт его: операнды условий из строк (`"close"`, `"module.value"`, `"params.lower_threshold"`) превращаются во внутренние структуры `{ kind: :bar, key: :close }`, `{ kind: :module }`, `{ kind: :param }` — чтобы `BacktestEngine` мог оценивать их напрямую по строке данных без повторного парсинга. Также собираются runtime-параметры (`module_period`, `position_mode` и пользовательские значения) и метки целей оптимизации.

Умеет:

- `signals_for(prev_row:, row:, params:)` — вычислить сигналы на баре;
- `run_params(runtime_params)` — собрать параметры для результата запуска;
- `optimization_param_key(target)` — определить, какой runtime-параметр менять при оптимизации.

#### Research::RunRequest

Парсинг HTTP-запроса. Извлекает dataset, execution, optimization. Валидирует YAML через `Catalog`. Формирует `executor_config` и `response_payload`.

#### Research::Executor

Загружает свечи из БД через `Candle::FindQuery`, запускает модуль (EMA/RSI), собирает строки и передаёт в `BacktestEngine`. Кэширует результаты модуля по периоду, чтобы не пересчитывать при оптимизации.

Формат строки на один бар:

```ruby
{
  time: 1704067200,
  bar: { open: 42010.0, high: 42240.0, low: 41920.0, close: 42100.0, volume: 1532.4 },
  result: { ema: { value: 42080.4 } }
}
```

#### Research::BacktestEngine

Симуляция торговли. Проходит по строкам, вызывает `system.signals_for` на каждом баре, открывает и закрывает позиции. Учитывает:

- `fee_bps` — комиссия в базисных пунктах;
- `slippage_bps` — проскальзывание в базисных пунктах;
- `position_mode` — `long_short`, `long_only`, `short_only`.

Возвращает список сделок.

#### Research::Optimizer

Перебор параметра по диапазону (from / to / step). Многократно вызывает `executor.run(...)` с разными значениями. Репортит прогресс через `ProgressBroadcaster`.

#### Research::ProgressBroadcaster

Отправляет события в ActionCable канал `research:<run_id>`:

| Событие | Когда |
| --- | --- |
| `started` | Начало run / optimization |
| `progress` | Завершён очередной прогон |
| `completed` | Все прогоны завершены |
| `failed` | Ошибка |

### Серверные модули

Модули живут в `app/services/research/modules/` и наследуют `Research::Modules::Base`.

Каждый модуль принимает свечи и возвращает ряд `{ time, result }`. Расчёт выполняется через гем `technical_analysis`.

Чтобы добавить новый модуль:

1. Создать класс в `app/services/research/modules/`.
2. Добавить его в `Executor::MODULES`.
3. Добавить тип и параметры в `dictionary.yml`.

## API

### Каталог

| Method | Path | Описание |
| --- | --- | --- |
| `GET` | `/api/research/catalog` | Список систем и директорий |

Ответ:

```json
{
  "systems": [
    {
      "id": "price_ema_cross",
      "name": "Price / EMA Cross",
      "file_name": "price_ema_cross.yml",
      "relative_path": "price_ema_cross.yml",
      "yaml": "id: price_ema_cross\n...",
      "metadata": { ... }
    }
  ],
  "directories": ["strategies"]
}
```

### Валидация

| Method | Path | Описание |
| --- | --- | --- |
| `POST` | `/api/research/validate` | Валидация YAML в реальном времени |

Параметры: `system_yaml` или `system_id` + `system_path`.

Ответ:

```json
{
  "ok": true,
  "diagnostics": [],
  "system": {
    "id": "price_ema_cross",
    "name": "Price / EMA Cross",
    "module": { "type": "ema", "params": { "period": "20" } },
    "params": { "position_mode": "long_short" },
    "conditions": ["long_entry", "long_exit", "short_entry", "short_exit"],
    "optimization_targets": [
      { "value": "module.period", "label": "EMA period" }
    ]
  }
}
```

### CRUD систем и директорий

| Method | Path | Описание |
| --- | --- | --- |
| `POST` | `/api/research/systems/save` | Создать или обновить систему |
| `POST` | `/api/research/systems/rename` | Переименовать систему |
| `POST` | `/api/research/systems/delete` | Удалить систему |
| `POST` | `/api/research/directories/create` | Создать директорию |
| `POST` | `/api/research/directories/rename` | Переименовать директорию |
| `POST` | `/api/research/directories/delete` | Удалить директорию |

### Запуск

| Method | Path | Описание |
| --- | --- | --- |
| `POST` | `/api/research/run` | Запуск бэктеста или оптимизации |

Пример запроса:

```json
{
  "symbol": "BTCUSD",
  "timeframe": "1h",
  "start_time": "2026-01-01T00:00:00Z",
  "end_time": "2026-02-01T00:00:00Z",
  "system_yaml": "id: rsi_threshold\nname: RSI Threshold...",
  "execution": {
    "fee_bps": 4,
    "slippage_bps": 2
  },
  "optimization": {
    "enabled": true,
    "target": "params.lower_threshold",
    "from": 20,
    "to": 40,
    "step": 5
  },
  "run_id": "abc123"
}
```

Вместо `system_yaml` можно передать `system_id` и `system_path` — сервер загрузит YAML из каталога.

Пример ответа:

```json
{
  "strategy": "rsi_threshold",
  "system": {
    "type": "rsi_threshold",
    "params": { "position_mode": "long_short", "lower_threshold": 30.0 }
  },
  "module": {
    "type": "rsi",
    "params": { "period": "14" }
  },
  "dataset": {
    "symbol": "BTCUSD",
    "timeframe": "1h",
    "start_time": "2026-01-01T00:00:00Z",
    "end_time": "2026-02-01T00:00:00Z"
  },
  "optimization": {
    "enabled": true,
    "param": "params.lower_threshold",
    "from": 20,
    "to": 40,
    "step": 5
  },
  "runs": [
    {
      "mode": "optimization",
      "stage": "in_sample",
      "params": {
        "system_id": "rsi_threshold",
        "system_name": "RSI Threshold Reversal",
        "module_type": "rsi",
        "module_period": 14,
        "position_mode": "long_short",
        "lower_threshold": 20.0,
        "upper_threshold": 70.0
      },
      "trades": [
        {
          "entryTime": 1704067200,
          "entryPrice": 42100.0,
          "exitTime": 1704153600,
          "exitPrice": 42520.0,
          "direction": "long",
          "pnl": 410.5,
          "pnlPercent": 0.975,
          "bars": 24
        }
      ]
    }
  ]
}
```

## Frontend

### YAML-редактор

Stimulus-контроллер `system_editor_controller` с модулями в `app/javascript/system_editor/`:

- `editor_core.ts` — Monaco-подобный textarea-редактор;
- `validation.ts` — отправка YAML на `/api/research/validate` при каждом изменении, подсветка ошибок;
- `file_picker.ts` — выбор системы из каталога;
- `state.ts` — состояние редактора.

### Research-таб

Stimulus-контроллер `research_controller` с модулями в `app/javascript/research/`:

| Файл | Назначение |
| --- | --- |
| `state.ts` | Сбор параметров из формы |
| `request.ts` | HTTP-запрос к `/api/research/run` |
| `catalog.ts` | Загрузка каталога систем |
| `results.ts` | Обработка и отображение результатов |
| `selected_run_view.ts` | Детали выбранного прогона |
| `summary.ts` | Сводная статистика |
| `optimization_chart.ts` | График зависимости метрики от параметра |
| `runs_grid.ts` | Таблица всех прогонов оптимизации |
| `progress.ts` | UI-индикатор прогресса |
| `progress_subscription.ts` | ActionCable-подписка на `research:<run_id>` |
| `sidebar_renderer.ts` | Боковая панель с параметрами |
| `file_manager.ts` | CRUD систем в UI |
| `research_file_picker.ts` | Выбор файла системы |
| `dsl.ts` | TypeScript-типы DSL |
| `types.ts` | Общие типы research |
| `templates.ts` | HTML-шаблоны |

### Что считается на фронтенде

Сервер возвращает массив `runs`, каждый содержит `trades`. Фронтенд на базе trades считает:

- equity curve;
- статистику (win rate, Sharpe, Sortino, Calmar, drawdown);
- отображение метрик.

Это сделано специально, чтобы Research и Data Tab Trading Systems использовали один и тот же код расчёта метрик.

## Примеры систем

### Price / EMA Cross

Цена пересекает EMA вверх — long, вниз — short.

```yaml
id: price_ema_cross
name: Price / EMA Cross

module:
  type: ema
  params:
    period: 20

params:
  position_mode: long_short

conditions:
  long_entry:
    operator: cross_above
    left: close
    right: module.value
  long_exit:
    operator: cross_below
    left: close
    right: module.value
  short_entry:
    operator: cross_below
    left: close
    right: module.value
  short_exit:
    operator: cross_above
    left: close
    right: module.value

optimization:
  targets:
    - module.period
```

### RSI Threshold Reversal

RSI пересекает нижний порог — long, верхний — short.

```yaml
id: rsi_threshold
name: RSI Threshold Reversal

module:
  type: rsi
  params:
    period: 14

params:
  position_mode: long_short
  lower_threshold: 30
  upper_threshold: 70

conditions:
  long_entry:
    operator: cross_below
    left: module.value
    right: params.lower_threshold
  long_exit:
    operator: cross_above
    left: module.value
    right: params.upper_threshold
  short_entry:
    operator: cross_above
    left: module.value
    right: params.upper_threshold
  short_exit:
    operator: cross_below
    left: module.value
    right: params.lower_threshold

optimization:
  targets:
    - module.period
    - params.lower_threshold
    - params.upper_threshold
```

### Long Only с фиксированным порогом

Только long-позиции, вход при закрытии выше 50000.

```yaml
id: btc_above_50k
name: BTC Above 50K Long Only

module:
  type: ema
  params:
    period: 10

params:
  position_mode: long_only

conditions:
  long_entry:
    operator: gt
    left: close
    right: 50000
  long_exit:
    operator: lt
    left: close
    right: module.value
```

## Файловая структура backend

```
app/services/research/
├── system.rb                      # Скомпилированная торговая система
├── run_request.rb                 # Парсинг HTTP-запроса
├── executor.rb                    # Загрузка данных и один бэктест
├── backtest_engine.rb             # Симуляция торговли
├── optimizer.rb                   # Перебор параметра по диапазону
├── progress_broadcaster.rb        # Realtime-прогресс через ActionCable
├── modules/
│   ├── base.rb                    # Базовый класс серверных модулей
│   ├── ema.rb                     # EMA
│   └── rsi.rb                     # RSI
└── dsl/
    ├── catalog.rb                 # Каталог систем + файловые операции
    ├── compiler.rb                # YAML → Research::System
    ├── validator.rb               # Инфраструктура валидации + SourceMap
    ├── validation_result.rb       # Результат валидации
    ├── validation_error.rb        # Исключение валидации
    ├── diagnostic.rb              # Одна ошибка с привязкой к позиции
    └── validators/
        ├── structure.rb           # Валидация структуры, module, params
        ├── conditions.rb          # Валидация conditions и операндов
        └── optimization.rb        # Валидация optimization targets
```

## Тесты

| Файл | Что проверяет |
| --- | --- |
| `spec/services/research/executor_spec.rb` | Загрузка данных, расчёт модуля, формирование результата |
| `spec/services/research/optimizer_spec.rb` | Перебор параметров, формирование массива runs |
| `spec/services/research/run_request_spec.rb` | Парсинг payload, валидация, формирование конфигурации |
| `spec/services/research/dsl/validator_spec.rb` | Валидация YAML: все ошибки, все случаи |
| `spec/services/research/dsl/catalog_spec.rb` | CRUD систем и директорий |
| `spec/requests/api/research_spec.rb` | HTTP-тесты API |

## Как добавить новый модуль

1. Создать класс в `app/services/research/modules/`:

```ruby
class Research::Modules::Sma < Research::Modules::Base
  def call(period:)
    TechnicalAnalysis::Sma.calculate(input_data, period: period.to_i, price_key: :close)
      .map(&:to_hash)
      .map do |point|
        { time: time_for(point[:date_time]), result: { value: point[:sma]&.to_f } }
      end
  end
end
```

2. Зарегистрировать в `Research::Executor::MODULES`:

```ruby
MODULES = {
  ema: Research::Modules::Ema,
  rsi: Research::Modules::Rsi,
  sma: Research::Modules::Sma
}.freeze
```

3. Добавить в `config/research/dictionary.yml`:

```yaml
module:
  types:
    sma:
      label: SMA
      params:
        period:
          type: integer
          min: 1
          label: SMA period
```

После этого модуль доступен в YAML-системах и в UI.

## Как добавить новый параметр

1. Добавить в `dictionary.yml` секцию `params`:

```yaml
params:
  my_param:
    type: number
    label: My Parameter
```

2. Использовать в YAML-системе:

```yaml
params:
  my_param: 42

conditions:
  long_entry:
    operator: gt
    left: close
    right: params.my_param
```

3. Добавить в `optimization.targets` для оптимизации:

```yaml
optimization:
  targets:
    - params.my_param
```
