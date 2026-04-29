# Domain Glossary

## Market Data

**Candle** — серверная свеча по `symbol`, `exchange`, `timeframe`, `ts`, OHLCV. `1m` — базовый слой; агрегированные timeframes читаются из TimescaleDB continuous aggregates.

**MacroSeries** — временной ряд macro/on-chain показателей в TimescaleDB. Ключи включают `dxy`, `vix`, `fear_greed`, `fed_rate`, `m2`, `cpi`, `mvrv_ratio`, `mvrv_z_score`, `nupl`, `realized_price`.

**Dashboard Symbols** — crypto symbols главного dashboard. Хранятся в `config/dashboard.yml` и текущем `config/dashboard.current.yml`.

**Market Symbols** — indices/forex/commodities tiles. Не являются candle source of truth.

## Workspace

**Tab** — frontend-сущность рабочего пространства. Типы: `chart`, `data`, `system_stats`, `research`, `system_editor`, `assistant`.

**Panel** — область внутри chart tab. Содержит timeframe, overlays, drawings, volume profile.

**Overlay** — слой графика: price, volume или indicator. Macro overlays используют отдельный data source и scale.

**Primary Panel / Primary Overlay** — стабильные anchors linked workflows. Primary overlay задает базовый symbol linked data tab.

**Preset** — сохраненный snapshot workspace. `payload` — JSONB в PostgreSQL, не отдельное хранилище.

## Data Grid

**DataConfig** — состояние data tab: symbols, timeframe, columns, conditions, systems, chartLinks, sourceTabId, date range.

**DataColumn** — колонка data grid: OHLCV, indicator, change, formula, instrument, macro.

**Condition** — правило поверх rows: highlight, filter, marker, color zone.

**TradingSystem** — data-grid система с long/short entry/exit, slippage, display settings. Генерирует trades, stats и chart markers.

**SystemStats Tab** — отдельный tab с метриками, equity curve и сделками по выбранной системе.

## Research

**Research System** — YAML DSL файл в `config/research/systems/**/*.yml`.

**Module Alias** — ключ в `modules`, например `ema_fast`; результат доступен в conditions как `ema_fast.value`.

**Condition Expression** — строковое выражение DSL с candle fields, module refs, params, operators and helper functions.

**Optimization Target** — параметр системы, который можно перебрать в optimizer.

**Research Run** — серверный backtest/optimization процесс с progress events через ActionCable.

## System Editor and Assistant

**System Editor** — workspace tab для редактирования YAML research systems, catalog/file picker, validation, highlighting, autocomplete.

**Assistant Tab** — workspace LLM UI, может быть linked к System Editor.

**AiChat / AiMessage / AiToolCall** — persistence чата, сообщений и tool calls.

**Assistant Context** — нормализованный JSON workspace/editor state для LLM.

**Draft** — YAML system candidate, извлеченный из tool result или assistant message.

**Harness** — режим LLM system editor сценария: `system_patch` или `system_design`.

## Degraded Modes

**backendOnline** — Rails API доступен.

**internetOnline** — браузер имеет internet connectivity.

**bitfinexReachable** — Bitfinex доступен по health snapshot / exchange status.

**IndexedDB Cache** — производный browser cache candles/indicator series. Не source of truth.

## Memory Bank Meta

**Feature Package** — директория `memory_bank/features/<id>_<slug>/` для одной фичи или технической области. Forward package содержит `brief.md`, `spec.md`, `plan.md`; retrospective package содержит `summary.md`.

**Backfilled Summary** — retrospective `summary.md`, созданный по уже существующей shipped реализации. Не описывает будущие пожелания как текущий контракт.

**Stage** — workflow этап; canonical values live only in `memory_bank/workflow.md` -> `Stage Values`. Если active feature нет, `current-focus.md` uses `—`. Retrospective package type выводится из структуры файлов; review/fix фиксируются через `Review notes` и `Следующий шаг`, а не отдельное значение stage.

**Stage Gate** — правило перехода между этапами. Если gate не выполнен, следующий этап блокируется.

**Review Note** — файл `reviews/<stage>.md` с headers `Фича`, `Стадия`, `Статус`, `Дата`, итогом, замечаниями и следующим шагом.

**Review Note Status** — `advisory` разрешает двигаться дальше с зафиксированным риском; `blocking` запрещает переход до `fix review` и повторного review.

**BLOCKER** — fail-fast сообщение, когда обязательный артефакт, путь или precondition отсутствует. Агент не должен восстанавливать missing upstream по памяти.

**Verified By** — секция backfilled summary со списком behaviors, которые подтверждены или ограничены источниками из `Tests`, code paths and docs.

**Main Implementation** — секция backfilled summary с основными runtime/config paths для shipped behavior.
