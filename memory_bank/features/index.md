# Feature Packages Index

Feature package хранит forward-артефакты `brief.md`, `spec.md`, `plan.md` или retrospective `summary.md` для уже shipped областей. Retrospective packages фиксируют текущий контракт системы, known gaps and re-review triggers in `summary.md`.

## Реализованные

| ID | Feature | Stage | PRD Area | Main sources |
|---|---|---|---|---|
| 001 | [Core market data foundation](001_core_market_data_foundation/) | done | cross-cutting | `docs/01-product-overview.md`, `docs/02-architecture.md`, `docs/03-domain-model.md`, `docs/05-api.md` |
| 002 | [Dashboard and market tiles](002_dashboard_and_market_tiles/) | done | 1 | `docs/01-product-overview.md`, `docs/06-ui-workflows.md`, dashboard code/config |
| 003 | [Chart workspace](003_chart_workspace/) | done | 2 | `docs/03-domain-model.md`, `docs/06-ui-workflows.md`, chart workspace code |
| 004 | [Browser cache and offline modes](004_browser_cache_and_offline_modes/) | done | 8 | `docs/08-offline-mode.md`, frontend cache/connectivity code |
| 005 | [Data grid MVP](005_data_grid_mvp/) | done | 3 | `docs/03-domain-model.md`, `docs/06-ui-workflows.md`, data tab code/tests |
| 006 | [Conditions and chart projection](006_conditions_and_chart_projection/) | done | 3 | `docs/03-domain-model.md`, `docs/06-ui-workflows.md`, data/chart linking code |
| 007 | [Trading systems and stats](007_trading_systems_and_stats/) | done | 4 | `docs/03-domain-model.md`, `docs/06-ui-workflows.md`, trading system code/tests |
| 008 | [Presets and auth](008_presets_and_auth/) | done | cross-cutting | `docs/02-architecture.md`, `docs/03-domain-model.md`, presets/auth code |
| 009 | [Research YAML DSL](009_research_yaml_dsl/) | done | 5 | `docs/09-research-systems.md`, `config/research/systems` |
| 010 | [Research backtest and optimization](010_research_backtest_and_optimization/) | done | 5 | `docs/09-research-systems.md`, research services/jobs/API |
| 011 | [System editor](011_system_editor/) | done | 6 | `docs/06-ui-workflows.md`, `docs/09-research-systems.md`, system editor code |
| 012 | [Macro and on-chain data sources](012_macro_and_onchain_data_sources/) | done | cross-cutting | `docs/01-product-overview.md`, `docs/03-domain-model.md`, macro sync code |
| 013 | [LLM assistant core](013_llm_assistant_core/) | done | 7 | `docs/10-llm-assistant.md`, assistant models/API/frontend |
| 014 | [LLM system editor integration](014_llm_system_editor_integration/) | done | 7 | `docs/10-llm-assistant.md`, assistant tools and system editor integration |
| 015 | [Workspace frontend refactor](015_workspace_frontend_refactor/) | done | cross-cutting | workspace TypeScript modules, frontend tests, recent git history |
| 016 | [Memory bank process](016_memory_bank_process/) | done | process | `memory_bank/`, `.prompts/`, `CLAUDE.md` |
| 017 | [ML signal modules](017_ml_signal_modules/) | done | cross-cutting | ML models/runs/predictions, Research modules, `ml_signal` YAML integration |
| 018 | [ML signal workspace and catalogue](018_ml_signal_workspace_and_catalog/) | done | cross-cutting | ML workspace tab, data-grid prediction columns, expanded Research modules |

## Готовы к реализации

| ID | Feature | Stage | PRD Area | Main sources |
|---|---|---|---|---|

Active task cursor lives in `memory_bank/process/current-focus.md`.

## Backfill Rule

Retrospective packages are not a substitute for commit history. They answer:
- what contract the current implementation exposes;
- which invariants future work must preserve;
- where the main implementation and tests live;
- which checks should run before changing that area;
- which known gaps are explicit rather than hidden.

Coverage audit lives in [coverage.md](coverage.md). Use it to map PRD areas and touched paths to the summary that should be read first.

Index fields:
- `Stage` uses the feature-package enum from `memory_bank/workflow.md` -> `Stage Values`.
- Package type is derived from files: `summary.md` with no forward artifacts means retrospective; any `brief.md`, `spec.md` or `plan.md` means forward work is active for gate purposes. Do not create retrospective `brief.md`, `spec.md` or `plan.md` for already shipped behavior.
- `Stage: done` means the feature is shipped. For retrospective packages, `summary.md` is enough; for forward packages, `reviews/impl.md` must exist and be non-blocking.
- `PRD Area` maps to numbered sections in `memory_bank/prd.md`; `cross-cutting` and `process` are documented metadata values, not product areas.

Forward work queue:
- List forward packages under `Готовы к реализации` once `brief/spec/plan` exists and the next action is not simply resume of current focus.
- The active next command lives in `memory_bank/process/current-focus.md`.

Retrospective packages are complete when `summary.md` has `Verified By`, `Main Implementation`, `Tests`, `Invariants Enforced By Code`, and `Known Gaps / Tech Debt`. Retrospective summaries do not use `ac-*`. If future work changes retrospective behavior, create forward `brief.md` first with the relevant `summary.md` as context, then assign stable `ac-*` ids in `spec.md` before writing `plan.md`; retro backfill `brief/spec/plan` remains forbidden.
