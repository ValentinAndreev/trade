# ML Signal Modules — Spec

**Brief:** `memory_bank/features/017_ml_signal_modules/brief.md`

## Goal

Add trained ML prediction series as reusable Research/YAML modules without leaving the Rails/Ruby workspace. Data-grid and workspace UI exposure is feature 018.

## Scope

In:
- Persist model metadata, training run metadata, model weights and precomputed predictions.
- Support one MVP prediction family: price-direction classification for a configured horizon, exposed as probability, direction and confidence values.
- Add a YAML DSL module type for model-backed prediction series.
- Run training and inference in the Rails/Ruby process through an adapter boundary.
- Expose backend/API entry points to list models/runs, create training runs and cancel training runs.
- Extend the existing Research module catalogue with the minimal normalized/state/risk modules required by the MVP baseline feature spec.
- Reuse persisted predictions across research backtests and inference reads.
- Keep the MVP model registry global inside the authenticated internal app; per-user model ownership is out of scope.

Out:
- Broker execution or live trading.
- Distributed training, GPU cluster scheduling, AutoML, or hyperparameter optimization UI.
- External Python services, ONNX import/export, or network model hosting.
- Real-time online learning, drift detection, or automatic retraining.
- Replacing existing technical-analysis modules or macro/external series.
- Multi-user model marketplace, sharing permissions, or per-user model ACLs beyond the app's existing auth boundary.
- Bulk model farms, all-symbol/all-timeframe precomputation or unlimited prediction retention.
- Automatic TTL/retention policy for predictions; MVP retention is manual operational cleanup, while recomputed predictions replace stale rows in place by primary-key upsert.
- Data-grid ML columns, workspace model-management UI, frontend model autocomplete and full normalized/state/risk module catalogue expansion; these move to feature 018.
- Destructive model-management UI, model deletion, prediction purge, or training-run reset.

## Requirements

1. A model record stores a stable `key`, display name, architecture, prediction target, serving status, latest successful training run identity, latest failed training run identity, metric summary and serving weight checksum. Direction-classification metric summaries use canonical keys `accuracy`, `log_loss`, `auc` and `baseline_majority`; unavailable metrics are stored as `nil` rather than omitted.
2. Each training run stores an immutable snapshot of dataset spec, resolved feature spec, hyperparams, random seed, training status, metrics, error metadata, heartbeat timestamp, weight checksum and fitted feature/normalization metadata.
3. The serving `weight_checksum` is `SHA-256` over the successful training run's canonical run snapshot: dataset spec, resolved feature spec, fitted feature metadata, hyperparams, `seed`, adapter/schema version, `weights_format` and serialized weights. The resolved feature spec includes each module entry's `module_version` and definition/formula checksum, so changing a feature module's semantics requires a new training run and cannot silently reuse prior weights.
4. MVP models are global within the existing authenticated app boundary, not owned per user. Any authenticated user can see global model/run state in MVP; this is a known single-user/internal-app gap until ACLs are added.
5. Model weights are persisted durably and can be loaded by inference after a Rails restart; baseline MVP weight blobs are capped at 16 MB to keep lazy-loaded database blob reads bounded in Rails memory.
6. The 16 MB blob cap is an MVP storage guard, not a torch/LNN target size; changing adapter family requires a storage/performance review and may raise the cap or migrate artifact storage.
7. Models are immutable after first successful training except for serving pointer/status updates from new training runs. Model deletion and prediction purge require an explicit future admin path.
8. Creating a training run for an unknown `model_key` atomically creates a draft `MlModel` plus the run in one transaction; if validation/enqueue fails, no orphan model remains. Creating a training run for an existing key reuses that model.
9. Training runs are background jobs with visible status: queued, running, succeeded, failed and cancelled. The MVP uses a dedicated/constrained ML queue with effective concurrency `1` for training jobs to keep CPU-bound Ruby training from competing unpredictably with candle-data request paths.
10. A training run can be cancelled before completion through cooperative cancellation: the job stores a persisted cancellation flag, dataset building, adapter training and prediction batching check it at deterministic yield points, and cancelled runs must not write final weights or mark the model trained.
11. Only one queued or running training run may exist for the same model key at a time, enforced by a database partial unique index in addition to service-level validation.
12. Training progress uses persisted run state plus ActionCable progress events; polling may exist only as a recovery/fallback path.
13. Feature 017 implements one MVP prediction target: binary directional classification. For candle timestamp `t`, features use only data available at or before `t`; the training label uses the configured future horizon and label deadband: `up` when `return(t, horizon) > label_deadband_return`, `down` when `return(t, horizon) < -label_deadband_return`, and no training label when the absolute return is inside the deadband. The default `label_deadband_return` is `0.0`, so exact flat ties are excluded from training instead of being silently labeled as down. Model metadata still stores `prediction_target`; new target families require a later spec/plan update and, if their output shape does not fit the MVP columns, a prediction-storage migration.
14. Model `feature_spec` is a list of Research module specs resolved through the existing module catalogue, with module key, `module_version`, definition/formula checksum, concrete params, output fields, per-entry resolved warmup/lookback computed from params, lookahead policy and description.
15. Existing technical-analysis modules may continue using the current `Research::Modules::Base` proxy to the `technical-analysis` gem. New 017 pure-Ruby modules must implement the same `{ time:, result: ... }` call contract through a native Research module interface/parent or an explicit `call` override; they must not accidentally fall through to `Base#ta_class`.
16. ML `feature_spec` validation accepts only metadata-complete modules whose warmup and lookahead policy are declared. Existing indicators without warmup/lookahead metadata are rejected for ML features until their metadata is backfilled.
17. The 017 module set is intentionally minimal and covers only the baseline default features: `log_return`, `rolling_volatility`, `range_position`, `rolling_zscore`, `percentile_rank`, `trend_regime_score`, `vol_regime_score` and `vol_adjust`. The remaining state/risk/normalization catalogue belongs to feature 018.
18. Minimal module semantics:
    - `range_position` outputs close position inside a rolling high/low range, bounded to `[0, 1]` when the range is non-zero.
    - `trend_regime_score` outputs signed trend strength, normalized to `[-1, 1]`.
    - `vol_regime_score` outputs a bounded volatility-regime score in `[0, 1]`; module metadata and specs pin the exact heuristic.
    - `vol_adjust` outputs an input value divided by a rolling volatility estimate with an epsilon guard.
    - The persisted resolved feature spec stores the module metadata/version/checksum needed to reproduce these heuristics after code changes.
19. The MVP training dataset uses normalized/state/risk Research module outputs by default, not raw `close` alone. Raw OHLCV values may be source inputs to modules, but model examples should be scale-aware and portable across symbols/timeframes.
20. Normalization modules that learn statistics fit them only from the training window available at or before each example, persist fitted metadata with the training run/weights and apply the same transformation during inference.
21. Feature-spec validation rejects modules whose lookahead policy would allow inference-time dependence on candles after `t`.
22. Rows without enough historical feature/module warmup are returned with explicit `nil` prediction values, not fabricated values.
23. Rows without enough future data for training labels, or with a future return inside the configured label deadband, are excluded from the training dataset and counted in dataset diagnostics.
24. Prediction rows are stored uniquely by `(model, exchange, symbol, timeframe, ts, weight_checksum)` and include the `training_run_id` plus model weight checksum used to produce them. Recomputing the same serving-snapshot key replaces the row by guarded upsert instead of appending stale copies, and an older serving snapshot must not overwrite a row produced by a newer successful training run for that snapshot key.
25. `ml_predictions` is a TimescaleDB hypertable partitioned by `ts` with an explicit `chunk_time_interval` chosen in the plan; every primary key or unique constraint on this table must include `ts`.
26. `MlPrediction` does not rely on Rails id-based ActiveRecord behavior. It has no standalone `id`, no id-based associations, no dependent destroy path, and is written/read through repository queries and `upsert_all`/SQL using the unique identity index.
27. Inference captures an immutable serving snapshot `(training_run_id, weight_checksum, weights_payload, resolved_feature_spec, fitted_metadata)` at the start of an operation and writes predictions with that checksum even if a retrain succeeds concurrently. One snapshot is reused across outputs and batches for the same model inside the operation; MVP concurrent operations may each capture their own snapshot, but the implementation must not clone weight payloads per row, output or alias.
28. Inference may compute missing predictions on demand for a requested range, but every successful computed value must be committed before it is returned for research reuse. Inference failures are returned as structured service/API errors and are not stored as error rows in `ml_predictions`; research backtests/optimizations treat adapter or persistence failure as a run error, while UI/grid callers may surface per-column errors and `nil` values.
29. Inference is range-oriented: callers request a candle range and the service computes missing/stale predictions in batches, not row-by-row N+1 calls. MVP in-process baseline inference has a target budget of about 5 seconds for one model over 10,000 candles on local development hardware; this is a benchmark/observability target, while hard rejection is based on explicit caps, invalid input or cancellation.
30. Prediction compute enforces a maximum of 50,000 requested prediction rows. MVP requests are scoped to one `(exchange, symbol, timeframe)` tuple, so `prediction_row_count = candle_count * distinct_requested_models`; requested outputs do not multiply stored rows because one stored prediction tuple contains probability, direction and confidence for a model snapshot. A future multi-tuple batch API must multiply by `distinct(exchange, symbol, timeframe)` as part of its spec change. Requests above the cap return structured errors before inference.
31. Research backtests invoking `ml_signal` pass the research cancellation context into `Ml::InferenceService`; cancelling a research run must stop pending ML inference batches at deterministic checkpoints.
32. Baseline training is deterministic for the same dataset spec, feature spec, hyperparams and random seed within the same Ruby/platform/libc environment. Default hyperparams include `seed: 0`, `max_iterations: 200`, `tolerance: 1e-4`, `class_weight: balanced`, `learning_rate: 0.1` and `label_deadband_return: 0.0`; byte-identical floating-point results across different Ruby or libc implementations are out of scope for MVP.
33. YAML systems can declare a model-backed module, for example:

   ```yaml
   modules:
     lnn_signal:
       type: ml_signal
       model_key: btc_direction_lnn_v1
       output: probability
   ```

34. The module result is aligned to the candle series and can be consumed in conditions as `<alias>.value`.
35. YAML validation rejects unknown, untrained, failed-serving, positive-lookahead or incompatible model references before research execution starts. Backtest and optimization jobs revalidate referenced models after enqueue and immediately before `ml_signal` inference starts, so a model state change between editor validation and execution returns structured diagnostics instead of using a stale reference. A failed retrain must not demote a previously trained serving model: prior weights and predictions remain valid while `latest_failed_training_run_id` surfaces the latest failure separately; models with no prior trained weights are unavailable.
36. Backtests, optimizations and inference reads must not mutate candle data or saved YAML systems.
37. Training/inference duration, cancellation, cap rejection and adapter failure are recorded with structured logs or persisted run/error metadata sufficient for debugging the first failed production run.
38. Training jobs update `heartbeat_at` while running. A run stuck in `running` with a stale heartbeat after worker crash is reconciled by a lifecycle/reaper path that marks it failed with structured stale-worker metadata before allowing a new run for the same model key.

## Invariants

- Server candle data remains the source of truth for training, inference and backtesting.
- Candle, training and prediction timestamps are stored, compared and checksummed in UTC; local timezone formatting is presentation-only.
- MVP acceptance criteria validate pipeline correctness, determinism, no-lookahead behavior and reuse semantics; they do not assert predictive lift above `baseline_majority`.
- A prediction for timestamp `t` must not depend on candles after `t` at inference time.
- Training labels may look forward only inside the training dataset builder; labels must never be available as module values.
- State/risk/normalization modules are a shared Research module contract, not ML-private helper functions; Research DSL metadata and LLM tools read the same catalogue in 017, and data-tab reuse is feature 018.
- Modules used as ML features declare warmup and lookahead behavior and must be no-lookahead at inference time.
- Modules with missing warmup/lookahead metadata are not eligible for ML `feature_spec`.
- Resolved feature specs include module version and definition/formula checksum metadata; checksum changes invalidate model weights and prediction reuse.
- Weight checksums use `SHA-256` over a canonical run snapshot that includes adapter/schema version and `weights_format`; incompatible older formats are rejected rather than guessed.
- Existing technical-analysis-backed modules, custom modules such as `external_series`, and new pure-Ruby native modules may have different implementation ancestors, but they share the same Research module result contract.
- Effective source-window checksum coverage for a timestamp is based on the maximum warmup/lookback required by all modules in the training run's feature spec.
- Source-window checksums use the documented SHA-256 digest over canonical candle row content for exactly the `[t - effective_window, t]` source window; they must not depend on unrelated candles before/after the window and must not use process-random, Ruby-version-dependent or non-deterministic hash functions.
- Feature normalization must not fit on validation/test/future rows or on the requested inference range as a whole.
- Any validation/test split for time-series model metrics must be chronological. Random K-fold/random row splits are not allowed; if a validation window is introduced, training rows whose label horizon or feature window overlaps the validation window are purged, with an embargo at least as large as `max(label_horizon, effective_window)` before training resumes.
- Training run dataset spec, resolved feature spec, hyperparams and fitted metadata are immutable snapshots.
- A serving snapshot is immutable within an inference operation and is reused per model/output batch rather than cloned per prediction row.
- A backtest that starts before a retrain captures pre-retrain serving weights for that run; a second backtest that starts after the retrain may capture newer weights, so per-run reproducibility is guaranteed but cross-run comparisons must record `training_run_id` and `weight_checksum`.
- Model references are validated before research execution and fail with structured diagnostics.
- Prediction rows store successful values only; inference failures, batch failures and training failures stay in API/run metadata rather than as permanent hypertable rows.
- Stale prediction recompute uses guarded `ON CONFLICT DO UPDATE` semantics for `(ml_model_id, exchange, symbol, timeframe, ts, weight_checksum)` and does not append duplicate rows for the same serving snapshot.
- Prediction upserts are monotonic by successful `MlTrainingRun.created_at` with `id` as a tie-breaker; a stale inference operation can fill missing rows for its captured `weight_checksum` but cannot overwrite rows already produced by a newer serving snapshot for that checksum.
- 017 must not alter frontend preset/localStorage schemas; workspace and data-grid state changes belong to feature 018.
- Training and inference must stay in-process; no Python service or remote inference endpoint is allowed.
- Model and training APIs use the existing authenticated app boundary; per-user model ACL is out of scope for MVP. ActionCable progress uses the existing session-backed `ApplicationCable::Connection.current_user` identification, matching `ResearchProgressChannel`.
- Training run creation must guard against concurrent queued/running runs for the same model key.
- Training worker concurrency is intentionally constrained for MVP; raising it requires a performance/resource-contention review.
- All primary key and unique constraints on the Timescale-backed `ml_predictions` table must include `ts`; do not add a standalone `id` primary key that would block hypertable creation.
- Rails persistence specs must exercise real `insert_all`/`upsert_all` or equivalent SQL against the test database and the hypertable unique index; do not rely only on in-memory model behavior for `MlPrediction`.
- Training cancellation is cooperative and must be checked in dataset building, adapter training and prediction batching rather than relying on Solid Queue to kill a running job.
- Research-run cancellation must be handed off to ML inference when `ml_signal` is evaluated inside a backtest.
- Source-window checksums must use stable candle content (`ts`, OHLCV) and must not include mutable bookkeeping fields such as `updated_at`.

## Acceptance Criteria

- [ ] **ac-store-model-metadata-and-weight-snapshots:** Completing a training run persists model metadata, immutable run snapshots for dataset spec, resolved feature spec with module version/checksum metadata, hyperparams, seed, fitted metadata, canonical metrics, durable weights capped at 16 MB and deterministic `SHA-256` weight checksum; service/model specs verify reload and over-cap failure.
- [ ] **ac-create-training-run-model-atomically:** Creating a training run for a new `model_key` creates the draft model and run atomically; validation/enqueue failure leaves no orphan model; creating a run for an existing key reuses that model.
- [ ] **ac-global-model-registry-auth-boundary:** Model and training endpoints require the existing authenticated app boundary and expose a global MVP model registry rather than per-user ownership or ACL.
- [ ] **ac-safe-model-lifecycle:** Models cannot be destructively deleted or purged through 017 APIs, failed retrains do not replace prior serving weights, and a successful retrain updates only the serving pointer/checksum.
- [ ] **ac-store-predictions-in-timescale:** Migration creates `ml_predictions` as a TimescaleDB hypertable partitioned by `ts` with an explicit chunk interval, every primary key/unique constraint including `ts`, uniqueness for `(ml_model_id, exchange, symbol, timeframe, ts, weight_checksum)`, persisted `training_run_id`/checksum snapshot metadata, and an `MlPrediction` model/repository that avoids id-based ActiveRecord operations.
- [ ] **ac-register-minimal-state-risk-modules:** The existing Research module catalogue exposes stable module version, definition/formula checksum, params schema, output fields, warmup, lookahead policy, description and formula/heuristic metadata for the minimal 017 module set; pure-Ruby modules use a native Research module path rather than falling through to the technical-analysis proxy; backend schema and LLM DSL reference read from the same catalogue.
- [ ] **ac-train-on-module-derived-normalized-features:** The MVP baseline model trains from `feature_spec` entries resolved through the Research module catalogue, includes normalized/state/risk features by default, persists fitted normalization metadata, fits normalization only on the training subset when validation/test splits exist, uses chronological validation/test splits with purge/embargo if such splits are introduced, and has tests proving raw `close` alone is not the default training feature set.
- [ ] **ac-reject-lookahead-feature-modules:** Feature-spec validation rejects modules with positive lookahead or unsupported output fields before training or inference starts.
- [ ] **ac-run-training-with-progress:** Starting training enqueues a background job on the constrained ML queue and reports queued/running/succeeded/failed progress through persisted run state and ActionCable updates; job/channel specs cover success, failure and stale-heartbeat reconciliation.
- [ ] **ac-cancel-training-run:** Cancelling a queued/running training run records a persisted cancellation flag; dataset builder, adapter and predictor check it at deterministic yield points; the run transitions to `cancelled`; no final weights are written.
- [ ] **ac-single-active-training-run:** Creating a second queued/running training run for the same model key returns a structured conflict and does not enqueue duplicate training; concurrent creates are protected by a DB partial unique index.
- [ ] **ac-enforce-non-leaking-labels:** Dataset builder tests prove feature windows end at or before `t`, never include `t+1..t+horizon`, future labels are used only for training targets, tie/deadband rows are excluded from training diagnostics rather than forced into the down class, and rows without full history/future label are excluded or returned as `nil` according to their use.
- [ ] **ac-precompute-and-reuse-predictions:** Inference captures one immutable serving snapshot per model inside an operation, stores successful predictions uniquely for `(model, exchange, symbol, timeframe, ts, weight_checksum)`, and subsequent research reads reuse existing rows when the captured checksum and source-window checksum match.
- [ ] **ac-recompute-stale-predictions:** If the serving checksum, dataset spec, feature spec, fitted metadata or stable candle OHLCV/timestamp content in the effective warmup window changes, stale predictions are ignored or recomputed with guarded `ON CONFLICT DO UPDATE` replacement that prevents older snapshots from overwriting newer prediction rows.
- [ ] **ac-batch-range-inference:** Inference accepts a requested range, computes missing/stale predictions in batched adapter calls, persists them in bulk, and returns a candle-aligned series without per-row N+1 queries; service specs prove one adapter call per batch for a 10,000-candle range path.
- [ ] **ac-cap-prediction-ranges:** Prediction compute rejects requests above 50,000 total prediction rows, counted as `candle_count * distinct(model_key)` stored prediction tuples for one `(exchange, symbol, timeframe)` tuple, with structured errors before starting on-demand inference; any future multi-tuple request shape must extend the cap formula before implementation.
- [ ] **ac-deterministic-baseline-training:** Baseline logistic regression uses deterministic ordering, seeded randomness if needed, default `seed: 0`, default `max_iterations: 200`, default `tolerance: 1e-4`, default `class_weight: balanced`, default `learning_rate: 0.1`, default `label_deadband_return: 0.0`, canonical metric fields and reproducibility specs for identical inputs on the same Ruby/platform/libc environment.
- [ ] **ac-register-ml-yaml-module:** YAML DSL accepts `type: ml_signal` with a valid model reference and output field, then exposes an aligned `<alias>.value` series to condition expressions.
- [ ] **ac-reject-invalid-ml-yaml:** YAML validation returns structured errors for unknown model keys, untrained or failed-serving models, incompatible symbol/timeframe constraints, unsupported output fields, positive-lookahead feature specs and missing required params; a failed retrain with prior serving weights keeps validating against the last successful weights.
- [ ] **ac-revalidate-ml-model-at-execution:** Backtests and optimizations revalidate `ml_signal` model references after enqueue and immediately before inference; if a model becomes unavailable, incompatible or positive-lookahead, execution fails that run with structured diagnostics instead of using stale editor validation state.
- [ ] **ac-use-ml-series-in-backtests:** Backtests and optimizations can use ML module values in conditions while preserving existing next-candle fill semantics and without mutating saved systems or candles.
- [ ] **ac-cancel-backtest-ml-inference:** Cancelling a research run propagates to any in-flight ML inference batches started by `ml_signal`, and specs cover cancellation before the next ML batch is computed.
- [ ] **ac-observe-training-and-inference:** Training and inference record structured duration/status/error metadata for success, cancellation, cap rejection and adapter failure.
- [ ] **ac-no-external-python-service:** Training and inference are invoked through a Ruby in-process adapter; tests stub the adapter and no code path shells out to a Python service or remote inference endpoint.

## Implementation Constraints

- Do not add a new gem or npm package without explicit approval; if the ML adapter needs `torch-rb` or another dependency, the plan must call out the approval step before implementation.
- Do not edit existing migrations; add new migrations for model, training run and prediction storage.
- Store `ml_predictions` as a TimescaleDB hypertable unless a later approved spec change replaces this decision.
- Do not add `composite_primary_keys`; `MlPrediction` must avoid id-based ActiveRecord APIs and use repository/upsert query paths.
- If Active Storage is used for weights, include the required Active Storage tables/migration path because the current app only loads the engine/config and does not currently show active storage tables in the schema.
- MVP baseline weights may use a dedicated database blob table with a 16 MB cap so one lazy-loaded blob read stays bounded; larger model artifacts require a future storage migration or Active Storage plan.
- Adapter implementations must expose deterministic cancellation/progress yield points through the Ruby adapter API, including simple baseline classifiers that do not naturally have neural-network epochs.
- Dataset building, prediction reuse, YAML validation and prediction persistence must stay algorithm-agnostic. Baseline-specific weight schema, coefficients and solver details stay inside the baseline adapter and `weights_format`; future adapters such as Ruby numerical-library adapters, `torch-rb`/LibTorch adapters or out-of-process services require a separate dependency/storage/performance spec update.
- Do not enable Timescale compression on `ml_predictions` while it is the active guarded-upsert table. Any future compression/retention work must first define a hot mutable prediction table versus archived immutable/compressed storage strategy.
- Do not duplicate state/risk/normalization math inside ML services when the operation belongs in a shared Research module.
- Add RBS for new public Ruby classes and methods under mirrored `sig/` paths.
- Keep API controllers thin; put ML dataset, training, inference and prediction lookup behavior under `app/services`.
- Use structured validation/errors for YAML and API responses; do not rely on log-only failures.
- Heavy training work must be avoided in unit specs; use small deterministic fixtures and adapter stubs.
- External provider/network availability must not be required for training/inference tests.
