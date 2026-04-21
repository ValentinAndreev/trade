# Domain Model

## Обзор

Ниже перечислены ключевые сущности системы и место, где каждая из них живет.

## Candle

Главная серверная сущность.

Содержит:

- `symbol`
- `exchange`
- `timeframe`
- `ts`
- `open`
- `high`
- `low`
- `close`
- `volume`

Хранение:

- raw свечи пишутся в таблицу `candles`;
- таблица сделана hypertable через TimescaleDB;
- для популярных таймфреймов есть continuous aggregates.

Практический смысл:

- `1m` это базовый слой данных;
- `5m`, `15m`, `1h`, `4h`, `1d` оптимизированы через materialized continuous views;
- нестандартные таймфреймы строятся по запросу.

## MacroSeries

Макроэкономические временные ряды.

Хранение:

- TimescaleDB hypertable `macro_series`;
- каждая запись: `indicator` (ключ), `ts` (timestamp), `value` (float).

Поддерживаемые индикаторы:

| Ключ | Описание | Источник | Частота |
| --- | --- | --- | --- |
| `dxy` | Dollar Index | Yahoo Finance | hourly |
| `vix` | Volatility Index | Yahoo Finance | hourly |
| `fear_greed` | Crypto Fear & Greed Index | AlternativeMe | daily |
| `fed_rate` | Fed Funds Rate | FRED API | daily |
| `m2` | M2 Money Supply | FRED API | daily |
| `cpi` | Consumer Price Index | FRED API | daily |

Синхронизация через `MacroSyncJob`. Данные используются как оверлеи на графике и как поля в условиях торговых систем.

## User

Базовая сущность аутентификации.

Содержит:

- `username`
- `password_digest`

Используется только для сессионного логина и владения пресетами.

## Preset

Пользовательский снимок рабочего пространства.

Содержит:

- `name`
- `payload`
- `is_default`
- `user_id`

`payload` это JSON с фронтенд-состоянием и серверным snapshot конфигурации инструментов хранится в PostgreSQL в колонке `presets.payload`;

## Dashboard Symbols

Это не отдельная таблица БД. Dashboard-конфигурация живет в двух YAML:

- `config/dashboard.yml`
- `config/dashboard.current.yml`

В `config/dashboard.yml` лежат `all` и `default`.

В `config/dashboard.current.yml` лежит текущее отображаемое состояние; если файла нет, он генерируется из `default`.

## Market Symbols

Market symbols живут в тех же двух файлах внутри секции `markets`:

- `markets.symbols.all`
- `markets.symbols.default`
- `markets.labels`

Текущее отображаемое состояние рынков хранится в `config/dashboard.current.yml` и тоже генерируется из `default`, если текущего файла нет.

## Tab

Фронтенд-сущность верхнего уровня рабочего пространства.

Типы:

- `chart`
- `data`
- `system_stats`

Хранится:

- в `localStorage`;
- внутри `Preset.payload`, если пользователь сохраняет пресет в БД.

## Panel

Подобласть внутри chart-tab.

Содержит:

- `timeframe`
- `overlays`
- графические разметки;
- настройки volume profile.

Один chart-tab может содержать несколько panels.

У chart-tab есть `primaryPanelId`. Это "главная" panel вкладки, которая используется как стабильная опорная точка для linked workflows, даже если пользователь меняет визуальный порядок panels.

## Overlay

Слой на панели графика.

Типовые режимы:

- `price`
- `volume`
- `indicator`

Содержит:

- `symbol`
- `chartType`
- `visible`
- `colorScheme`
- `opacity`
- `indicatorType`
- `indicatorParams`
- `indicatorSource` — `"client"` | `"server"` | `"macro"`
- `pinnedTo`

Особенности overlay с `indicatorSource === "macro"`:

- данные загружаются напрямую из `/api/macro_series`, а не через стандартный indicator pipeline;
- в боковой панели не отображаются параметры `period` и `source` (их нет);
- при выборе в списке оверлеев получает собственную шкалу (не привязывается к price-шкале основного overlay).

Дополнительное правило:

- первый overlay на panel считается `primary overlay`;
- `primary overlay` нельзя удалить как обычный overlay;
- он исчезает только вместе с самой panel или tab;
- `primary overlay` нельзя переключить из `price` в `volume` или `indicator`;
- именно он задает основной symbol панели для linked data workflows.

## DataConfig

Описание data-tab.

Содержит:

- список `symbols`;
- `timeframe`;
- `columns`;
- `conditions`;
- `systems`;
- `chartLinks`;
- `sourceTabId`;
- временной диапазон.

Если data-tab связан с chart-tab, то:

- базовый symbol берется из primary overlay связанной panel;
- timeframe синхронизируется с chart panel;
- row click в таблице может перемещать связанный график к тому же timestamp;
- conditions и systems могут проецироваться обратно на график.

## DataColumn

Колонка в data grid. Может представлять:

| Тип | Описание |
| --- | --- |
| OHLCV | Стандартные поля свечи |
| `indicator` | Серверный или клиентский технический индикатор |
| `change` | Процентное или абсолютное изменение поля |
| `formula` | Пользовательское выражение |
| `instrument` | Значение другого symbol (close, volume, и т.д.) |
| `macro` | Макроэкономический индикатор (dxy, vix, fear_greed, fed_rate, m2, cpi) |

Именно `columns` определяют, какие серверные вычисления и какие клиентские трансформации будут участвовать в таблице.

## Condition

Правило для поиска событий в строках таблицы.

Поддерживает:

- сравнения больше/меньше;
- диапазоны;
- cross above / cross below;
- expression.

У condition есть не только правило, но и действие:

- highlight строки;
- marker на графике;
- color zone на графике;
- фильтрация строк.

## TradingSystem

Сущность прикладного анализа поверх data grid.

Описывает:

- long entry / exit;
- short entry / exit;
- slippage;
- цвета меток;
- флаг показа на графике.

На ее базе вычисляются:

- сделки;
- PnL;
- drawdown;
- win rate;
- Sharpe / Sortino / Calmar;
- equity curve.

В интерфейсе `TradingSystem` проявляется сразу в трех местах:

- в `data tab` как отдельная system-column;
- в `chart tab` как markers входов и выходов, если включен показ на графике;
- в отдельном `system_stats` tab с метриками и equity curve.

System-column показывает состояние системы на каждом баре:

- `ENTRY`
- `EXIT`
- `OPEN` для бара, где позиция остается открытой и считается плавающий PnL

## LlmSetting

Настройки LLM-провайдера для пользователя.

Содержит:

- `provider` — имя провайдера (openai, anthropic, gemini, openrouter, mistral, xai, ollama, llama);
- `model` — название модели;
- `api_base` — кастомный endpoint (опционально, нужен для ollama/llama.cpp);
- `temperature`, `max_output_tokens` — параметры генерации;
- `api_key` — зашифрованный ключ API (через Rails ActiveRecord encryption);
- `launch_config`, `launch_state` — для llama.cpp: конфигурация и состояние запуска локального сервера.

Одна запись на пользователя на провайдера. API-ключи **не хранятся** в Rails credentials — только в этой таблице в зашифрованном виде. Настраиваются через UI: страница ассистента → иконка настроек.

## AiChat / AiMessage / AiToolCall

Сущности LLM-ассистента.

`AiChat`:

- принадлежит пользователю;
- имеет `title`;
- содержит историю сообщений.

`AiMessage`:

- роль: `user`, `assistant`, `tool_result`;
- текстовое `content`;
- может содержать `tool_calls` (JSON).

`AiToolCall`:

- отдельные вызовы инструментов внутри ответа ассистента;
- содержит `tool_name`, `input`, `output`.

Вся история диалогов хранится в PostgreSQL. Ассистент может читать текущую конфигурацию торговой системы из редактора и предлагать изменения в режимах `system_patch` (патч существующего YAML) или `system_design` (полная генерация).

## Browser Cache

Отдельный производный слой данных, не являющийся source of truth.

Состоит из:

- `localStorage` для workspace-state;
- `IndexedDB` для свечей и индикаторных рядов.

`IndexedDB` используется для:

- быстрого холодного старта chart/data tabs;
- offline/degraded mode;
- повторного использования уже рассчитанных indicator series.

## Market Quote

Котировка для блока indices/forex/commodities.

Это не полноценная доменная сущность БД. Она собирается на лету из Yahoo Finance и нужна только для UI-плиток.

## Где что хранится

| Сущность | Где хранится | Комментарий |
| --- | --- | --- |
| Candle | PostgreSQL / TimescaleDB | Историческая база свечей |
| MacroSeries | PostgreSQL / TimescaleDB | Макро-данные (hypertable `macro_series`) |
| User | PostgreSQL | Сессионная аутентификация |
| LlmSetting | PostgreSQL | Настройки LLM провайдера, api_key зашифрован |
| AiChat / AiMessage / AiToolCall | PostgreSQL | История диалогов ассистента |
| Preset | PostgreSQL | Пользовательские сохранения |
| Preset payload | PostgreSQL JSONB | Лежит внутри `presets.payload` |
| Dashboard symbols | YAML | Серверное состояние главной страницы |
| Market symbols | YAML | Серверное состояние market tiles |
| Tabs / panels / overlays | LocalStorage | Локальное workspace-состояние |
| Cached candles | IndexedDB | Браузерный кэш для chart/data tabs |
| Cached indicator series | IndexedDB | Браузерный кэш рассчитанных индикаторов |
| Yahoo quotes | Rails cache | Краткоживущий кэш |
| Bitfinex status / tickers / timestamp cache | Rails cache | Snapshot и ускорение запросов |

## Важное различие: source of truth vs browser state

В проекте полезно различать три слоя:

- server state: свечи, пользователи, пресеты, dashboard/market symbols;
- client workspace state: табы, панели, выделения, navigation state;
- browser cache: локальные копии свечей и индикаторов в IndexedDB.

Следствие:

- `IndexedDB` ускоряет работу, но не считается основной истиной;
- `Preset.payload` считается частью server state, потому что хранится в БД;
- проблемы с linked tabs и проблемы с "пропал workspace после reload" обычно живут в разных слоях.
