# ML Signal Workspace and Catalogue — Brief

## Goal

Build on feature 017's ML research foundation by exposing trained model predictions in data tabs, adding a workspace model-management UI, and expanding the normalized/state/risk Research module catalogue beyond the minimal baseline set.

## For Whom

Project owner / trader-researcher who wants to inspect ML predictions in the data grid, manage training runs from the workspace, and use a broader shared set of feature-engineering modules across DSL, data views and LLM-assisted system design.

## Domain Context

- Feature 017 provides ML model storage, training jobs, in-process inference, minimal module-derived features and the `ml_signal` YAML module.
- Data grid (feature 005) supports persisted `DataColumn` configs and server-backed columns.
- Workspace tabs and persistence are covered by features 011 and 015.
- LLM system-editor integration (features 013/014) loads DSL/module metadata from the Research schema and `modules_meta.yml`.

## Requirements

- Data tabs can add a model-backed prediction column for the current symbol/timeframe/window.
- Prediction grid requests enforce the same backend cap semantics as final 017: `candle_count * distinct(modelKey)` for one `(exchange, symbol, timeframe)` tuple. Requested outputs and duplicate columns do not multiply backend inference rows because one persisted prediction row stores the full direction-classification tuple.
- Workspace UI lists models and training runs, shows deterministic loading/empty/succeeded/failed states, and lets the user create/cancel training runs.
- Training progress UI subscribes to the existing ML training progress channel and falls back to API state on reconnect/reload.
- System editor autocomplete can discover available model keys without loading weight blobs through an explicit capped autocomplete contract that preserves the plain 017 `GET /api/ml/models` array response. Autocomplete responses support prefix search and surface when more matches exist so the UI does not silently hide models after the first 50.
- Full normalized/state/risk module catalogue expansion is implemented as Research modules, not as a separate registry or ML-private helpers. The 018 set is `rolling_corr`, `spread`, `ratio`, `stationarity_proxy`, `heteroskedasticity_proxy`, `zscore`, `robust_zscore`, `minmax_position`, `lag`, `delta`, `rolling_mean`, `rolling_std`, `ema_smoother`, `clip` and `winsorize`. These modules operate on the current research/data-grid candle series or same-series module/external inputs; cross-symbol and cross-timeframe feature refs are a future feature.
- LLM tools and docs expose the expanded module catalogue and ML UI/data-grid behavior.

## Non-Scope

- Changing feature 017 training/inference storage contracts.
- Adding `torch-rb`, LNN, GPU, external Python services or new model families.
- Per-user model ACLs or model marketplace.
- Automatic prediction TTL/retention policy.
- Broad all-symbol/all-timeframe precomputation.
- Cross-symbol or cross-timeframe feature-engineering modules.
