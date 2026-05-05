# ML Signal Modules — Plan

**Spec:** `memory_bank/features/017_ml_signal_modules/spec.md`

## Approach

Build the feature in storage-first slices, then layer deterministic services and Research DSL integration on top. Feature 017 is the backend/research foundation: storage, training, inference, minimal module-derived features and `ml_signal` YAML usage. Data-grid columns, workspace model UI, frontend autocomplete and the full state/risk module catalogue are split to feature 018. The MVP uses a small in-process Ruby logistic-regression baseline direction classifier behind an adapter boundary, so implementation can proceed without adding an unapproved gem. Future adapters may evaluate Ruby numerical-library paths, `torch-rb`/LibTorch or an out-of-process service, but that requires an explicit dependency, storage and performance spec update; 017 must keep DatasetBuilder, InferenceService, PredictionRepository and YAML validation independent of baseline weight internals.

The model registry stores `prediction_target`, but feature 017 implements only `direction_classification`; different target families remain future work behind the same adapter/storage boundary.

ML examples are built from the existing Research module catalogue, not from raw `close` or ML-private helper functions. Feature specs name a minimal reusable state/risk/normalization module set in 017; feature 018 expands the catalogue and frontend surfaces.

The baseline is a pipeline-correctness MVP. Metrics are persisted for comparison and debugging, but no acceptance criterion requires accuracy to beat `baseline_majority`; predictive-lift gates belong to a later modelling brief with validation-split policy.

Training stays in Ruby, so MVP training jobs use a constrained ML queue with effective concurrency `1`. This keeps CPU-bound baseline training and future heavier in-process adapters from competing unpredictably with request paths that serve candle data and reused predictions.

The current `Research::Modules::Base` remains the technical-analysis proxy. Pure-Ruby 017 modules use an explicit native Research module parent/interface (or an explicit `call` override) and must not fall through to `Base#ta_class`; `external_series` remains a custom module that already overrides `call`.

Prediction staleness is handled with two checksums: the model `weight_checksum` and a per-row `source_window_checksum` computed from the candle feature window used for that timestamp. `weight_checksum` is `SHA-256` over the canonical run snapshot and includes the resolved feature spec, including each feature module's version, params, resolved warmup/lookback and definition/formula checksum, so module semantic changes invalidate old weights instead of silently changing inference meaning.

Storage choices are explicit before implementation: `ml_predictions` is a TimescaleDB hypertable partitioned by `ts`; baseline model weights are stored in a separate lazy-loaded database blob table with a 16 MB MVP size cap; the model registry is global within the existing authenticated internal app. The MVP does not add a Timescale compression policy for `ml_predictions` because prediction rows may be recomputed/upserted across historical ranges; compression/retention policy is a later storage brief and must separate hot mutable upsert rows from any archived immutable/compressed prediction history.

Performance budget is explicit but enforced mainly through shape tests and observability rather than brittle wall-clock CI checks: one model over a 10,000-candle range should use batched adapter calls and bulk persistence, with a target of about 5 seconds on local development hardware. Hard rejection is reserved for cap violations, invalid input and cancellation.

Prediction caps use one formula across 017 and 018 for the MVP single-market request shape: `prediction_rows = candle_count * distinct_requested_models`, because one stored prediction tuple contains probability, direction and confidence for a model snapshot. 017 and 018 requests are scoped to one `(exchange, symbol, timeframe)` tuple; if a future endpoint accepts multiple tuples in one request, its spec must multiply the cap by `distinct(exchange, symbol, timeframe)`.

Prediction storage deliberately avoids a Rails `id` primary key because Timescale unique constraints must include `ts`. `MlPrediction` is repository-managed: no id-based `find`, no dependent destroy, and writes use `upsert_all`/SQL against the unique identity index.

Storage migrations in steps 1a-1c must be timestamped sequentially in the same implementation branch so table/FK/hypertable dependencies cannot be interleaved by unrelated migrations. The `ml_predictions` migration rollback path drops the hypertable/table instead of trying to convert it back to a plain table; deploy rollback must treat prediction rows as recomputable cache state.

RBS files for public Ruby constants are added alongside the backend slice that introduces the constant. Focused backend step checks run relevant RSpec files; `bundle exec steep check` runs in the RBS audit step and final verification.

## Implementation Steps

### 1a. Core Model and Training Storage

**Files:** `db/migrate/*_create_ml_signal_models_and_runs.rb` (new), `app/models/ml_model.rb` (new), `app/models/ml_training_run.rb` (new), `spec/factories/ml_models.rb` (new), `spec/factories/ml_training_runs.rb` (new), `spec/models/ml_model_spec.rb` (new), `spec/models/ml_training_run_spec.rb` (new), `sig/app/models/ml_model.rbs` (new), `sig/app/models/ml_training_run.rbs` (new)

**Change:** Add global model metadata and training run storage. `MlModel` stores serving status, latest successful run/checksum and `latest_failed_training_run_id` for UI/API state where a failed retrain leaves prior serving weights active. `MlTrainingRun` stores immutable snapshots of dataset spec, resolved feature spec, hyperparams, seed, fitted feature metadata, canonical metrics (`accuracy`, `log_loss`, `auc`, `baseline_majority`), `heartbeat_at`, `cancellation_requested_at` and structured errors. Add a database partial unique index on `ml_training_runs(ml_model_id) WHERE status IN ('queued','running')`, plus service-level conflict handling, so concurrent create requests cannot enqueue duplicate active runs for the same model key. Model deletion/prediction purge are not exposed in 017.

**Check:** `bundle exec rspec spec/models/ml_model_spec.rb spec/models/ml_training_run_spec.rb`

**AC:** `ac-store-model-metadata-and-weight-snapshots`, `ac-global-model-registry-auth-boundary`, `ac-safe-model-lifecycle`, `ac-single-active-training-run`, `ac-cancel-training-run`

### 1b. Weight Blob Storage

**Files:** `db/migrate/*_create_ml_model_weight_blobs.rb` (new), `app/models/ml_model_weight_blob.rb` (new), `spec/factories/ml_model_weight_blobs.rb` (new), `spec/models/ml_model_weight_blob_spec.rb` (new), `sig/app/models/ml_model_weight_blob.rbs` (new)

**Change:** Store baseline MVP weights in `ml_model_weight_blobs` with `weights_payload`, versioned `weights_format`, `byte_size` and checksum metadata. Compute `weight_checksum = SHA-256(canonical_run_snapshot)` from the training run snapshot, including resolved feature module versions/definition checksums, hyperparams/`seed`, adapter/schema version, `weights_format`, fitted metadata and serialized weights. The baseline starts with `weights_format: baseline_direction_classifier:v1`; unknown or incompatible formats are rejected at load time with a structured retrain-required error rather than silently interpreted. Baseline logistic-regression weights should stay well below about 64 KB; the 16 MB table-level cap is a guardrail against unexpected artifacts and must be revisited for larger adapters such as numerical-library, torch/LNN or external-service artifact formats. Keep blobs out of model index/list serialization and load them only in training runner or predictor paths.

**Check:** `bundle exec rspec spec/models/ml_model_weight_blob_spec.rb`

**AC:** `ac-store-model-metadata-and-weight-snapshots`, `ac-no-external-python-service`

### 1c. Prediction Hypertable Storage

**Files:** `db/migrate/*_create_ml_predictions.rb` (new), `app/models/ml_prediction.rb` (new), `spec/factories/ml_predictions.rb` (new), `spec/models/ml_prediction_spec.rb` (new), `sig/app/models/ml_prediction.rbs` (new)

**Change:** Create `ml_predictions` as a TimescaleDB hypertable on `ts` with `chunk_time_interval => INTERVAL '3 months'`, matching the candle hypertable pattern for dense market time series rather than Timescale's small default. Avoid a standalone `id` primary key and do not add `composite_primary_keys`. Configure `MlPrediction.primary_key = nil` and keep the model repository-managed: no id-based `find`, no per-row `destroy`, no dependent destroy and no id-based callbacks. Every primary key/unique constraint must include `ts`, including uniqueness by `(ml_model_id, exchange, symbol, timeframe, ts, weight_checksum)` so concurrent retrain snapshots can coexist for reproducible backtests. Store only successful direction-classification prediction tuple values: `training_run_id`, `weight_checksum`, `source_window_checksum`, `probability`, `direction` and `confidence`; new target families need a later storage migration or spec update. Do not store per-row error/status records in the hypertable. Specs must exercise repository SQL against the test DB unique index/hypertable, not only in-memory model behavior; the CI/test database must load the TimescaleDB extension, and failures should be actionable environment failures rather than silent skips. Specs also assert `MlPrediction.primary_key.nil?` and cover repository paths so id-based `find`, id-based update/destroy and dependent-destroy assumptions fail visibly. Do not add compression policy in MVP; document that compression/retention needs a later storage decision. The migration `down` path drops the hypertable/table and indexes; it does not attempt a Timescale-to-plain-table conversion, so prediction rows are treated as recomputable cache state and down-migration order must keep model/weight tables available until prediction rollback finishes.

**Check:** `bundle exec rspec spec/models/ml_prediction_spec.rb`

**AC:** `ac-store-predictions-in-timescale`, `ac-precompute-and-reuse-predictions`, `ac-recompute-stale-predictions`

### 2a. State/Risk and Normalization Research Modules

**Files:** `app/services/research/modules/native.rb` (new), `app/services/research/modules.rb` (modify), `app/services/research/modules/log_return.rb` (new), `app/services/research/modules/rolling_volatility.rb` (new), `app/services/research/modules/range_position.rb` (new), `app/services/research/modules/rolling_zscore.rb` (new), `app/services/research/modules/percentile_rank.rb` (new), `app/services/research/modules/trend_regime_score.rb` (new), `app/services/research/modules/vol_regime_score.rb` (new), `app/services/research/modules/vol_adjust.rb` (new), `config/configs/indicators_config.rb` (modify), `app/services/candle/indicator_calculator.rb` (modify), `app/services/research/systems/schema.rb` (modify), `app/services/llm/system_editor/knowledge_base.rb` (modify), `app/prompts/llm/system_editor/modules_meta.yml` (modify), `spec/services/research/modules/state_risk_normalization_spec.rb` (new), `spec/services/candle/indicator_calculator_spec.rb` (modify), `spec/services/research/systems/schema_spec.rb` (modify), `spec/services/llm/system_editor/knowledge_base_spec.rb` (modify), `sig/app/services/research/modules/native.rbs` (new), `sig/app/services/research/modules/log_return.rbs` (new), `sig/app/services/research/modules/rolling_volatility.rbs` (new), `sig/app/services/research/modules/range_position.rbs` (new), `sig/app/services/research/modules/rolling_zscore.rbs` (new), `sig/app/services/research/modules/percentile_rank.rbs` (new), `sig/app/services/research/modules/trend_regime_score.rbs` (new), `sig/app/services/research/modules/vol_regime_score.rbs` (new), `sig/app/services/research/modules/vol_adjust.rbs` (new)

**Change:** Add only the normalized/state/risk building blocks needed by the 017 baseline as first-class Research modules, alongside the current technical-analysis modules and `external_series`. Keep `Research::Modules::Base` as the technical-analysis proxy, add `Research::Modules::Native` for pure-Ruby modules, and update `Research::Modules.for` so explicit module constants win before the technical-analysis fallback. Extend the existing catalogue/schema metadata so each module documents stable `module_version`, definition/formula checksum, label, params schema, output fields, warmup/lookback resolver as a function of params, lookahead policy, description and exact formula or heuristic. Existing indicators without warmup/lookahead metadata are not eligible for ML `feature_spec` until backfilled. Implement deterministic Ruby modules that return candle-aligned `{ time:, result: ... }` series and `nil` during warmup. `Candle::IndicatorCalculator` routes technical-analysis-backed indicators through the existing gem path and routes native 017 modules through their Research module implementation for data-table/schema parity. Module specs pin ambiguous outputs such as regime/proxy score ranges, prove native modules do not call `TechnicalAnalysis::*`, and include a regression case showing existing technical-analysis-backed modules still resolve through `Base#ta_class` after the resolution-order change. Expose those same module definitions through schema and LLM knowledge base; do not create a separate ML-only registry, do not migrate all existing technical indicators and do not implement the full 22-module catalogue in 017.

**Check:** `bundle exec rspec spec/services/research/modules/state_risk_normalization_spec.rb spec/services/candle/indicator_calculator_spec.rb spec/services/research/systems/schema_spec.rb spec/services/llm/system_editor/knowledge_base_spec.rb`

**AC:** `ac-register-minimal-state-risk-modules`, `ac-train-on-module-derived-normalized-features`, `ac-enforce-non-leaking-labels`

### 2b. Dataset Builder and No-Lookahead Contract

**Files:** `app/services/ml/dataset_builder.rb` (new), `app/services/ml/feature_matrix.rb` (new), `app/services/ml/feature_window.rb` (new), `app/services/ml/source_window_checksum.rb` (new), `spec/services/ml/dataset_builder_spec.rb` (new), `spec/services/ml/feature_matrix_spec.rb` (new), `spec/services/ml/source_window_checksum_spec.rb` (new), `sig/app/services/ml/dataset_builder.rbs` (new), `sig/app/services/ml/feature_matrix.rbs` (new), `sig/app/services/ml/feature_window.rbs` (new), `sig/app/services/ml/source_window_checksum.rbs` (new)

**Change:** Build training/inference examples from candle rows by resolving model `feature_spec` entries through the same Research module catalogue used by DSL modules, not by hard-coding ML-only feature math. Store the resolved feature spec with module version, concrete params, resolved warmup/lookback and definition/formula checksum in the training run snapshot. Reject unknown modules, missing output fields or missing warmup/lookahead metadata in `DatasetBuilder`/feature validation with structured errors. Load examples in deterministic order by `(exchange, symbol, timeframe, ts)` using UTC timestamps. The default baseline feature spec uses `log_return`, `rolling_volatility`, `range_position`, `rolling_zscore`, `percentile_rank`, `trend_regime_score`, `vol_regime_score` and `vol_adjust`; raw `close` alone is not the default feature set. Keep feature windows ending at `t`, future labels only for training, and `nil` inference outputs when history/module warmup is insufficient. Direction labels use `label_deadband_return` from the target config/hyperparams, defaulting to `0.0`: exact ties and rows inside the deadband are excluded from training and counted in dataset diagnostics, not labeled as down. Fit normalization metadata only from the training subset and persist the fitted metadata for inference reuse; if validation/test splits are added later, they must be chronological, transformed with training-fitted metadata, never used to fit normalization, and protected by purging rows whose feature/label windows overlap the validation/test interval plus an embargo of at least `max(label_horizon, effective_window)`. Random row splits and random K-fold are rejected for ML time-series metrics. Compute `effective_window = max(resolved_warmup/lookback for feature_spec entries)` and compute `source_window_checksum` from stable candle content across exactly `[t - effective_window, t]`: `ts`, open, high, low, close and volume. Canonicalize each candle row as versioned UTF-8 bytes with sorted field names, UTC timestamp bytes and fixed-scale decimal strings: OHLCV values are converted through `BigDecimal`, rounded to 10 fractional digits, rendered without exponent notation and padded to exactly 10 fractional digits. Compute `leaf_i = SHA256("ml-row-v1\\0" || canonical_row_i)`, then compute each window checksum as `SHA256("ml-window-v1\\0" || start_ts || "\\0" || end_ts || "\\0" || count || "\\0" || leaf_hashes_for_the_window_in_order)`, so the digest is independent of unrelated loaded candles before/after the window. Fixture specs must pin decimal canonicalization, UTC timestamp canonicalization, prefix-independent window behavior and one multi-row range digest. Do not use Ruby `Hash#hash`, xxhash or other non-cryptographic/process-dependent hashes, do not compute overlapping windows with unbounded DB reads, and keep the expected range-checksum path bounded by the 50,000-cell cap. Do not include mutable bookkeeping fields such as `updated_at`. Add cooperative cancellation checks while loading/building examples in chunks, before handing examples to the adapter.

**Check:** `bundle exec rspec spec/services/ml/dataset_builder_spec.rb spec/services/ml/feature_matrix_spec.rb spec/services/ml/source_window_checksum_spec.rb`

**AC:** `ac-train-on-module-derived-normalized-features`, `ac-enforce-non-leaking-labels`, `ac-recompute-stale-predictions`

### 3. In-Process Adapter Boundary

**Files:** `app/services/ml/adapters/baseline_direction_classifier.rb` (new), `app/services/ml/adapters/result.rb` (new), `app/services/ml/training_runner.rb` (new), `app/services/ml/predictor.rb` (new), `spec/services/ml/adapters/baseline_direction_classifier_spec.rb` (new), `spec/services/ml/training_runner_spec.rb` (new), `spec/services/ml/predictor_spec.rb` (new), `sig/app/services/ml/adapters/baseline_direction_classifier.rbs` (new), `sig/app/services/ml/adapters/result.rbs` (new), `sig/app/services/ml/training_runner.rbs` (new), `sig/app/services/ml/predictor.rbs` (new)

**Change:** Add a deterministic Ruby logistic-regression classifier over the Research-module-derived feature matrix from `DatasetBuilder`. Train with capped deterministic batch gradient descent over the dataset builder's deterministic row order using defaults `seed: 0`, `max_iterations: 200`, `tolerance: 1e-4`, `class_weight: balanced`, `learning_rate: 0.1` and `label_deadband_return: 0.0`, serialize weights plus fitted feature/normalization metadata as JSON well below 64 KB for the baseline, and predict probability/direction/confidence. Keep the logistic-regression coefficient schema private to `Ml::Adapters::BaselineDirectionClassifier`; callers interact only through `weights_format`, `train` and `predict` result objects. For `class_weight: balanced`, compute per-class sample weights as `w_c = n_examples / (2 * count_c)` for the binary classes and apply them consistently to loss and gradient; if one class is absent after deadband filtering, return a structured insufficient-class error instead of training. Store canonical metrics `accuracy`, `log_loss`, `auc` and `baseline_majority`; metrics unavailable for a tiny class set are stored as `nil`. Do not fail training solely because `accuracy <= baseline_majority`; that is reported as metric state for researcher review, not an MVP gate. Reproducibility specs assert identical results on the same Ruby/platform/libc environment; cross-environment bit-for-bit floating-point equivalence is out of scope.

Adapter API is fixed here, not deferred to RBS audit:
- `train(examples:, hyperparams:, callbacks:) -> Ml::Adapters::Result::TrainingResult`
- `predict(features:, weights:) -> Ml::Adapters::Result::PredictionBatch`
- `callbacks.check_cancelled!` and `callbacks.report_progress(...)` are mandatory yield points; the baseline calls them before training and after each training chunk even though it has no neural-network epochs.

Do not add `torch-rb`, shell out, or call external inference services.

**Check:** `bundle exec rspec spec/services/ml/adapters/baseline_direction_classifier_spec.rb spec/services/ml/training_runner_spec.rb spec/services/ml/predictor_spec.rb`

**AC:** `ac-store-model-metadata-and-weight-snapshots`, `ac-deterministic-baseline-training`, `ac-batch-range-inference`, `ac-no-external-python-service`

### 4a. Model and Training Run API

**Files:** `app/services/ml/training_run_lifecycle.rb` (new), `app/controllers/api/ml/training_runs_controller.rb` (new), `app/controllers/api/ml/models_controller.rb` (new), `config/routes.rb` (modify), `spec/requests/api/ml_training_runs_spec.rb` (new), `spec/requests/api/ml_models_spec.rb` (new), `sig/app/services/ml/training_run_lifecycle.rbs` (new), `sig/app/controllers/api/ml/training_runs_controller.rbs` (new), `sig/app/controllers/api/ml/models_controller.rbs` (new)

**Change:** Add authenticated API endpoints to list models/runs, create a training run and request cancellation of a queued/running run. `POST /api/ml/training_runs` is the first-registration path: for a new `model_key`, `Ml::TrainingRunLifecycle` creates the draft `MlModel` and `MlTrainingRun` atomically in one transaction; if validation or synchronous enqueue setup fails, no orphan model remains. The default `MlTrainingJob` enqueue is configured to publish only after the surrounding transaction commits. For an existing key it reuses the model. `GET /api/ml/models` is capped to the MVP registry size (`limit <= 50`) and does not need pagination until feature 018. `Ml::TrainingRunLifecycle` rejects creation when a queued/running run already exists for the same model key using both the DB partial unique index and structured service handling, writes `cancellation_requested_at` for cancellation requests, and keeps a failed retrain from replacing prior serving weights while updating `latest_failed_training_run_id`. Request specs assert the global authenticated registry boundary, no destructive delete/purge route, no orphan model on failed create, reuse of existing models, duplicate active-run race handling, latest-failed serialization and verify model list responses do not serialize `weights_payload`, `ml_model_weight_blob` or equivalent blob fields.

**Check:** `bundle exec rspec spec/requests/api/ml_training_runs_spec.rb spec/requests/api/ml_models_spec.rb`

**AC:** `ac-global-model-registry-auth-boundary`, `ac-create-training-run-model-atomically`, `ac-safe-model-lifecycle`, `ac-single-active-training-run`, `ac-cancel-training-run`, `ac-store-model-metadata-and-weight-snapshots`

### 4b. Training Job and Cooperative Cancellation

**Files:** `app/jobs/ml_training_job.rb` (new), `app/services/ml/training_runner.rb` (modify), `spec/jobs/ml_training_job_spec.rb` (new), `spec/services/ml/training_runner_spec.rb` (modify), `sig/app/jobs/ml_training_job.rbs` (new), `sig/app/services/ml/training_runner.rbs` (modify)

**Change:** Enqueue `MlTrainingJob` on the constrained ML queue, update persisted statuses (`queued`, `running`, `succeeded`, `failed`, `cancelled`), update `heartbeat_at` while running, save metrics/weights/checksum on success, and persist structured failure messages on error. Cancellation is cooperative: the job reloads the training run before starting, `DatasetBuilder` checks cancellation while loading/building chunks, `Ml::TrainingRunner` passes a callback/context object into the adapter, `callbacks.check_cancelled!` observes persisted cancellation state at deterministic adapter yield points, and cancelled runs exit before writing weights. The callback may be called frequently, but database reloads are throttled to no more than once every 200 ms per run unless a step boundary explicitly requires a fresh read; the throttle uses an injectable/monkeypatchable clock in tests so cancellation specs stay fast and deterministic. A stale-heartbeat reconciliation path marks long-stuck `running` jobs as `failed` with stale-worker metadata before the lifecycle permits another run for the same model. A failed retrain records the failed run and updates `latest_failed_training_run_id` but leaves the last successful serving weights/checksum intact. Persist duration/status/error metadata for observability.

**Check:** `bundle exec rspec spec/jobs/ml_training_job_spec.rb spec/services/ml/training_runner_spec.rb`

**AC:** `ac-run-training-with-progress`, `ac-cancel-training-run`, `ac-store-model-metadata-and-weight-snapshots`, `ac-safe-model-lifecycle`, `ac-observe-training-and-inference`, `ac-no-external-python-service`

### 4c. Training Progress Broadcasts

**Files:** `app/services/ml/progress_broadcaster.rb` (new), `app/channels/ml_training_progress_channel.rb` (new), `spec/channels/ml_training_progress_channel_spec.rb` (new), `spec/services/ml/progress_broadcaster_spec.rb` (new), `sig/app/services/ml/progress_broadcaster.rbs` (new)

**Change:** Broadcast progress over ActionCable using a stream scoped by `training_run_id`, for example `ml_training:<training_run_id>`. The channel reuses the existing session-backed `ApplicationCable::Connection.current_user` authentication boundary, matching `ResearchProgressChannel`, rejects blank/unknown run ids, and does not expose per-user ACL because the MVP registry is global inside the authenticated app. `Ml::ProgressBroadcaster` dedupes repeated progress payloads and throttles non-terminal progress events to at most once per second unless progress advances by at least one percentage point; queued/running start and terminal succeeded/failed/cancelled events are always emitted even when the immediately preceding non-terminal event was throttled. Persisted API state remains a fallback for reconnect/reload.

**Check:** `bundle exec rspec spec/channels/ml_training_progress_channel_spec.rb spec/services/ml/progress_broadcaster_spec.rb`

**AC:** `ac-run-training-with-progress`, `ac-cancel-training-run`, `ac-global-model-registry-auth-boundary`

### 5. Prediction Repository and Reuse

**Files:** `app/services/ml/prediction_repository.rb` (new), `app/services/ml/inference_service.rb` (new), `spec/services/ml/prediction_repository_spec.rb` (new), `spec/services/ml/inference_service_spec.rb` (new), `sig/app/services/ml/prediction_repository.rbs` (new), `sig/app/services/ml/inference_service.rbs` (new)

**Change:** Add prediction lookup and inference orchestration for one `(model, exchange, symbol, timeframe, range)` request tuple. Capture one immutable serving snapshot `(training_run_id, weight_checksum, weights_payload, resolved_feature_spec, fitted_metadata)` per model at the start of inference and reuse it across requested outputs and batches for the whole operation even if a retrain succeeds concurrently. Reuse rows only when captured `weight_checksum` and stable-content `source_window_checksum` match current inputs. Compute `source_window_checksum` over the effective warmup window from the captured feature spec using the SHA-256 source-window strategy from Step 2b, and load warmup candles before the requested range so overlapping backtests reuse predictions at range boundaries. Accept candle ranges, dedupe requested outputs by model because one stored row contains the probability/direction/confidence tuple, enforce `prediction_rows = candle_count * distinct_requested_models <= 50_000`, and include `requested_prediction_rows`, `max_prediction_rows` and range reduction hints in cap errors. Load missing/stale rows in batches, check cancellation before each batch, call the adapter once per batch, and bulk upsert successful predictions in a transaction with guarded conflict replacement: `ON CONFLICT (ml_model_id, exchange, symbol, timeframe, ts, weight_checksum) DO UPDATE ... WHERE (old_run.created_at, old_run.id) <= (excluded_run.created_at, excluded_run.id)`. Commit the successful batch before returning those values to a research caller; if persistence fails after adapter prediction, return a structured inference error rather than in-memory predictions. Do not accept a multi `(exchange, symbol, timeframe)` batch shape in 017; a future batch API must update the cap formula before implementation. Accept an optional cancellation context/callback so research runs can stop ML inference. Do not persist failed inference rows; return structured batch errors to callers, record duration/status/error metadata, and leave missing values as `nil` only for UI/API callers that can surface a per-output error.

**Check:** `bundle exec rspec spec/services/ml/prediction_repository_spec.rb spec/services/ml/inference_service_spec.rb`

**AC:** `ac-precompute-and-reuse-predictions`, `ac-recompute-stale-predictions`, `ac-batch-range-inference`, `ac-cap-prediction-ranges`, `ac-observe-training-and-inference`, `ac-no-external-python-service`

### 6. Research YAML Module and Validation

**Files:** `app/services/research/modules/ml_signal.rb` (new), `app/services/research/runs/execute.rb` (modify), `app/services/research/systems/schema.rb` (modify), `app/services/research/systems/validation/validator.rb` (modify), `app/services/research/systems/validation/checks/ml_models.rb` (new), `spec/services/research/modules/ml_signal_spec.rb` (new), `spec/services/research/systems/validation/validator_spec.rb` (modify), `spec/services/research/backtest_spec.rb` (modify), `spec/services/research/optimizer_spec.rb` (modify), `sig/app/services/research/modules/ml_signal.rbs` (new)

**Change:** Register a static `type: ml_signal` schema with required `model_key` and optional numeric `output`; do not enumerate DB model keys in `config/research/dictionary.yml`. Validate model existence, serving status, numeric output field (`probability` or `confidence`), symbol/timeframe compatibility and no-lookahead feature spec, rejecting modules whose warmup/lookahead metadata is missing. Batch-load all referenced `MlModel` records with one `where(key: keys)` lookup per validation pass instead of one SELECT per module. Revalidate the model reference after enqueue and immediately before inference/execution to catch deletion, serving-state or module-definition changes between editor validation and backtest job execution; return structured diagnostics rather than falling back to stale validation state. Implement `Research::Modules::MlSignal` to return candle-aligned `{ time:, result: { value: } }` rows through `Ml::InferenceService`, passing through the research cancellation context from `Research::Runs::Execute` so cancelled research runs stop pending ML inference batches. For backtests, adapter/persistence failures from `Ml::InferenceService` fail the research run with structured diagnostics; optimizations record the failed parameter run with diagnostics instead of aborting unrelated parameter values.

**Check:** `bundle exec rspec spec/services/research/modules/ml_signal_spec.rb spec/services/research/systems/validation/validator_spec.rb spec/services/research/backtest_spec.rb spec/services/research/optimizer_spec.rb`

**AC:** `ac-register-ml-yaml-module`, `ac-reject-invalid-ml-yaml`, `ac-revalidate-ml-model-at-execution`, `ac-reject-lookahead-feature-modules`, `ac-use-ml-series-in-backtests`, `ac-cancel-backtest-ml-inference`

### 7. RBS Coverage

**Files:** RBS files introduced in steps 1a-6, including `sig/app/models/ml_model.rbs`, `sig/app/models/ml_model_weight_blob.rbs`, `sig/app/models/ml_training_run.rbs`, `sig/app/models/ml_prediction.rbs`, `sig/app/jobs/ml_training_job.rbs`, `sig/app/services/research/modules/*.rbs`, `sig/app/services/ml/*.rbs`, `sig/app/services/ml/adapters/*.rbs`, and `sig/app/services/research/modules/ml_signal.rbs`.

**Change:** Audit and fill gaps in signatures introduced alongside each backend implementation slice; do not defer creation of public-service RBS to this final step. Keep adapter/result shapes explicit enough for `Research::Modules::MlSignal`, training and prediction repository callers.

**Check:** `bundle exec steep check`

**AC:** `ac-store-model-metadata-and-weight-snapshots`, `ac-run-training-with-progress`, `ac-cancel-training-run`, `ac-precompute-and-reuse-predictions`, `ac-batch-range-inference`, `ac-register-ml-yaml-module`

### 8. Documentation and Contract Updates

**Files:** `docs/05-api.md` (modify), `docs/09-research-systems.md` (modify), `docs/10-llm-assistant.md` (modify), `docs/11-developer-workflow.md` (modify), `memory_bank/features/coverage.md` (modify if forward-package coverage policy requires it after implementation), `memory_bank/features/017_ml_signal_modules/spec.md` (modify only if implementation discovers a needed contract clarification)

**Change:** Document `/api/ml/models`, `/api/ml/training_runs`, first-registration flow, constrained ML training queue, stale-heartbeat reconciliation/troubleshooting, minimal state/risk Research module metadata fields, native module contract, `ml_signal` YAML usage, model outputs, non-leaking label semantics, Timescale-backed prediction storage, unified range cap formula and LLM DSL reference exposure. Keep docs aligned with implemented 017 and avoid promising data-grid/workspace UI or LNN/torch behavior unless the dependency is explicitly approved and implemented.

**Check:** `bin/memory-bank-check`

**AC:** `ac-store-predictions-in-timescale`, `ac-register-minimal-state-risk-modules`, `ac-register-ml-yaml-module`, `ac-no-external-python-service`

## Verification

```bash
bin/rails db:migrate db:test:prepare
bin/rails runner "raise 'ml_predictions hypertable missing' unless ActiveRecord::Base.connection.select_values(\"SELECT hypertable_name FROM timescaledb_information.hypertables\").include?('ml_predictions')"
bundle exec rspec spec/models/ml_model_spec.rb spec/models/ml_model_weight_blob_spec.rb spec/models/ml_training_run_spec.rb spec/models/ml_prediction_spec.rb spec/services/research/modules/state_risk_normalization_spec.rb spec/services/candle/indicator_calculator_spec.rb spec/services/ml spec/services/research/modules/ml_signal_spec.rb spec/services/research/systems/schema_spec.rb spec/services/research/systems/validation/validator_spec.rb spec/services/research/backtest_spec.rb spec/services/research/optimizer_spec.rb spec/services/llm/system_editor/knowledge_base_spec.rb spec/jobs/ml_training_job_spec.rb spec/channels/ml_training_progress_channel_spec.rb spec/requests/api/ml_models_spec.rb spec/requests/api/ml_training_runs_spec.rb
bundle exec steep check
bin/rubocop
bin/brakeman --no-pager
bin/bundler-audit
bin/memory-bank-check
git diff --check
```
