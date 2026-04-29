# PRD — Trade Data Analysis

## Продукт

Внутреннее browser workspace приложение для market monitoring, chart analysis, data-table research, backtesting/optimization торговых систем и LLM-assisted разработки YAML research systems.

## Пользователи

Основной пользователь: project owner / developer / trader-researcher. Multi-user существует только настолько, насколько нужно для sessions, presets и assistant chats. Это не SaaS-продукт.

## Product Areas

### 1. Market Monitoring

Dashboard с crypto tickers, indices, forex и commodities.

### 2. Chart Workspace

Multi-tab, multi-panel charts с overlays, indicators, drawings, volume profile, realtime candles и macro overlays.

### 3. Data Table Analysis

Data tabs с OHLCV, indicators, formulas, instrument columns, macro columns, conditions и linked chart behavior.

### 4. Trading Systems

Rule-based systems поверх data-grid rows: markers, trade generation, metrics и equity curve.

### 5. Research Backtesting

Server-side YAML DSL systems, validation, backtest, optimization и progress streaming.

### 6. System Editor

YAML editor с catalog/file management, validation, highlighting, condition expression help и links to Research/Assistant.

### 7. LLM Assistant

Chat assistant для system design и system patching с provider settings, workspace context, tools, draft extraction и editor integration.

### 8. Degraded/Offline UX

Возможность продолжать полезную локальную работу, когда backend, internet или Bitfinex availability меняются.

## Feature Index Area Labels

`memory_bank/features/index.md` может использовать два не-продуктовых orientation label рядом с product areas:

| Label | Meaning |
|---|---|
| `cross-cutting` | Feature or invariant crosses multiple product areas and should not be forced into one numbered area. |
| `process` | Memory bank, prompts, CI/process or developer workflow; not a user-facing product area. |

## Non-Scope без нового Brief

- Broker execution.
- Public SaaS packaging.
- Full offline parity для server-side research.
- Unlimited provider/model support.
- Major storage schema changes без compatibility plan.
