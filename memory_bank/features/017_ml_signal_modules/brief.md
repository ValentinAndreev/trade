# ML Signal Modules — Brief

## Goal

Add ML-based prediction series as first-class research modules, so model signals can be used alongside indicators and macro series in YAML systems and backtests. The MVP target is an in-process Ruby logistic-regression direction classifier; it proves pipeline correctness, determinism, no-leakage and prediction reuse rather than promising predictive lift over a majority baseline. LNN/torch adapters are future work behind the adapter boundary. Data-grid columns and workspace UI are split to feature 018.

## For Whom

Project owner / trader-researcher running research backtests and market-data analysis. Wants to experiment with ML predictors as building blocks of trading systems without leaving the Ruby/Rails workspace.

## Domain Context

- Research systems are YAML DSL (feature 009) with modules; module results are series aligned to candles consumed by conditions (`alias.value`).
- Data grid (feature 005) supports indicator/macro/instrument/formula columns; ML grid columns are feature 018.
- Backtest/optimization (feature 010) drives Solid Queue jobs and `ProgressBroadcaster`.
- Future reference: Liquid Neural Network architecture for price-direction prediction (Habr 1020630). The article is not the 017 delivery target; LNN/torch-rb requires a later approved adapter/storage/performance plan.

## Current State

- No ML pipeline. No training, no model storage, no inference path.
- Modules cover technical indicators and external macro series only.
- Data grid has no model-backed column type; this remains out of 017 and moves to feature 018.
- Workspace UI has no training surface; 017 exposes backend state/API, while feature 018 adds the user-facing workspace.

## Requirements

- Trained ML model can be referenced from YAML system as a module that produces a per-candle series, usable in conditions like indicators.
- Models have stored metadata (architecture, dataset spec, hyperparams, training run identity) and persistent weights.
- Persistent weights are durable, baseline MVP artifacts are capped, and larger artifacts require a future storage plan before implementation.
- Training is initiated from internal backend/API entry points, runs as background job, and exposes persisted progress state.
- Training does not use raw `close` as the default model feature. MVP feature specs reference the same Research module catalogue used by indicators, external series, data tabs, DSL and LLM tools, extended with the minimal normalized/state/risk modules needed by the baseline. If this catalogue extension grows beyond the minimal 017 set, it must move to feature 018 or a separate feature before implementation.
- Predictions for (model, exchange, symbol, timeframe, ts) are computed once and reused by research backtests; 017 callers either pass the active research exchange or use the shared candle-query default exchange, and feature 018 can reuse the same persisted rows for data-grid reads.
- Reused predictions must be invalidated or recomputed when model weights or relevant candle history change.
- In-process MVP inference needs an explicit range cap and performance target for range requests; cap violations are hard rejects, while performance target violations are observable in run/API metadata rather than brittle wall-clock gates.
- MVP is scoped for internal research scale: a small number of active models and symbol/timeframe combinations. Bulk model farms or broad multi-market precomputation require a separate brief.
- Inference and training stay in the Ruby process for MVP; training runs in a constrained ML background queue, and on-demand inference is range-capped/reused so hot request paths do not perform unbounded work.
- Invalid/missing model references must fail visibly in YAML/API validation without corrupting other research systems.
- Predictions must be honest about labeling lookahead: training pipeline must enforce non-leaking windows, reject feature modules whose metadata cannot prove no-lookahead behavior, and keep training labels unavailable as module values in YAML/DSL/runtime rows.

## Non-Scope

- Live trading execution on ML signals.
- Multi-user model sharing, permissions or marketplace.
- GPU cluster / distributed training.
- AutoML / hyperparameter optimization UI (manual hyperparams in MVP).
- External Python services or ONNX import/export.
- LNN/torch-rb adapter implementation.
- Replacing existing technical-analysis modules.
- Data-grid ML columns, workspace model-management UI and full normalized/state/risk module catalogue expansion (feature 018).
- Real-time online learning / drift detection.
- Large-scale model farms, all-symbol/all-timeframe precomputation or unlimited prediction retention.
- Workspace preset/versioning behavior for ML columns (feature 018; model id is enough for MVP).
