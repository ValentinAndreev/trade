# ML Signal Workspace and Catalogue — Spec

**Brief:** `memory_bank/features/018_ml_signal_workspace_and_catalog/brief.md`

## Goal

Expose feature 017 ML models in data-grid and workspace workflows, and expand the shared Research module catalogue for feature engineering.

## Scope

In:
- Add a data-grid `ml_prediction` column type and server endpoint for visible-range prediction values.
- Add a workspace ML models tab with model/run list states and training create/cancel controls.
- Add frontend progress subscription and API fallback for training runs.
- Add model-key autocomplete for system editor using `/api/ml/models`.
- Expand the Research module catalogue with state/risk/normalization modules not shipped in 017.
- Update docs and LLM DSL reference for ML UI/data-grid/catalog usage.

Out:
- Changing feature 017 prediction storage, training runner, baseline adapter or `ml_signal` module contracts.
- New ML dependencies or out-of-process inference.
- Per-user ACLs; the registry remains global inside the authenticated app.
- Automatic retention or broad precompute.

## Requirements

1. Data tabs can add, persist, restore and render an `ml_prediction` `DataColumn` with `modelKey` and `modelOutput`.
2. The data-grid prediction endpoint accepts one or more ML column specs plus exchange/symbol/timeframe/range and returns values keyed by timestamp plus structured per-column errors. `exchange` may be omitted only when the backend resolves and echoes the shared candle-query default exchange.
3. Backend cap follows the final 017 single-market formula: `MAX_PREDICTION_ROWS = 50_000`, where `requested_prediction_rows = candle_count * distinct(modelKey)` for one `(exchange, symbol, timeframe)` tuple. Each `ml_prediction` column renders exactly one `modelOutput`, but outputs do not multiply the backend inference cap because `Ml::InferenceService` can request multiple outputs and one persisted `ml_predictions` row stores `probability`, `direction` and `confidence`. Duplicate columns for the same model/output pair, and multiple outputs for the same model, do not require duplicate inference. 018 must not reuse the 017 single-call cap hint/helper that hard-codes `distinct_requested_models: 1`; multi-column diagnostics must report the deduplicated model count and requested outputs per model used by the cap formula.
4. Frontend preflights the same distinct-model prediction-row count and shows a disabled/error state before sending obviously over-cap requests. The backend exposes the cap value used by the UI as `max_prediction_rows` so frontend/backend limits do not drift silently. Visible-range prediction requests are debounced/throttled, stale in-flight responses are ignored, invalid timeframes such as `0m` return structured request errors before inference starts, and the backend keeps an authenticated-session guard for concurrent grid prediction requests so a frontend bug cannot create unbounded in-process inference work.
5. Partial prediction responses are valid: available timestamps render values and missing timestamps render `nil`. Sorting an ML column places `nil` values last in both ascending and descending order; numeric range filters exclude `nil` values unless a later explicit missing-value filter is added. Grid/API diagnostics must distinguish ordinary not-yet-computed or unavailable predictions from the 017 guarded-upsert skip path where an older serving snapshot is not allowed to overwrite a newer row and the returned row does not match the requested `source_window_checksum`.
6. ML column errors remain local to the ML column and do not break OHLCV/indicator/macro/formula columns.
7. Workspace ML models tab has deterministic loading, empty, succeeded, failed and latest-failed-retrain-with-prior-serving states. It consumes the 017 `latest_failed_training_run_id`/run payload rather than issuing an extra latest-failure query for every render.
8. Model list API payloads and frontend state never include weight blobs.
9. Training create/cancel controls call the 017 APIs and subscribe to `MlTrainingProgressChannel`; reconnect/reload refreshes persisted API state. Frontend code uses the shared ActionCable reconnect behavior or an explicit backoff, and must not add a tight manual reconnect loop.
10. Model autocomplete uses `GET /api/ml/models/autocomplete?q=<prefix>&limit=50` with a capped response `{ models, meta }`, where `meta` includes `truncated`/`has_more`, `limit` and `max_prediction_rows`; the UI prompts the user to refine the query instead of silently hiding matches beyond the first 50. Plain `GET /api/ml/models` keeps the final 017 array response for workspace model lists unless a separate API-doc/test update explicitly changes that contract.
11. Expanded module set includes `rolling_corr`, `spread`, `ratio`, `stationarity_proxy`, `heteroskedasticity_proxy`, `zscore`, `robust_zscore`, `minmax_position`, `lag`, `delta`, `rolling_mean`, `rolling_std`, `ema_smoother`, `clip`/`winsorize` and any remaining base transforms deferred from 017. Pair modules such as `rolling_corr`, `spread` and `ratio` combine inputs from the current `(exchange, symbol, timeframe)` candle series, same-series module outputs or `external_series` aligned by last known value at or before the candle timestamp; for 018, the stored external-series `ts` is treated as the data availability timestamp and no separate publication-lag model is introduced. Cross-symbol and cross-timeframe refs are rejected in 018.
12. Expanded modules follow the same Research module catalogue contract from 017: params schema, output fields, warmup, lookahead policy, description and formula/heuristic metadata. Proxy modules with ambiguous names must pin exact formulas in metadata/specs before implementation; in 018 `stationarity_proxy` uses a bounded normalized drift heuristic between the current rolling mean and the previous rolling window mean, and `heteroskedasticity_proxy` uses a bounded normalized variance-change heuristic. Module descriptions must say these are lightweight heuristics, not ADF/KPSS/Levene/Breusch-Pagan statistical tests.
13. Existing tabs, presets and localStorage data without ML columns restore unchanged.
14. New ML workspace tabs serialize through the existing tab/preset schema with explicit defaults; presets created before 018 restore without needing an ML tab payload.
15. Workspace store hydration is version tolerant: missing ML fields receive defaults, legacy records restore without throwing, and unknown future tab/column types are not rendered but are preserved as opaque payloads through a load-save round trip so opening the app on a partially older frontend does not irreversibly strip newer workspace data.
16. 018 supports forward-compatible reads of older workspace/preset payloads. Rolling the application back after saving ML tabs or `ml_prediction` columns is not guaranteed to preserve those new payloads in older code and requires operational backup/restore rather than an app-level backward reader.
17. CSV export includes `ml_prediction` columns using the user-visible column label as the header and `columnFieldKey(col)` only as the internal row key; missing/error values export as blank cells rather than leaking `ml_prediction:<column_id>` keys.
18. Training progress subscription rejection or authorization failure is surfaced as a local training UI error and triggers an API-state refresh; the frontend must not spin in a tight resubscribe loop.
19. Runtime code, API/UI error messages and executable spec names do not mention feature IDs or historical task labels such as `017`/`018`; those references stay in memory-bank/docs/review artifacts only.
20. New input-ref, ML prediction and training code uses one canonical payload shape per boundary. Do not add helpers that accept symbol/string aliases, camel/snake aliases, multiple id names, blanket `to_h`/`to_s` coercion inside domain code, `finite?`/NaN/Infinity guards, or defensive type/capability checks unless the spec explicitly names an external boundary and tests each accepted shape.

## Acceptance Criteria

- [ ] **ac-add-ml-grid-column:** Data tabs can add, persist, restore and render an ML prediction column for the visible range; frontend persistence/type tests cover the new `DataColumn` shape.
- [ ] **ac-serve-grid-predictions:** Prediction endpoint returns per-column timestamp-keyed values and structured per-column errors while reusing 017 inference services.
- [ ] **ac-cap-grid-prediction-cells:** Backend rejects requests above 50,000 total prediction rows using `candle_count * distinct(modelKey)`, and frontend preflight prevents obvious over-cap requests with the same formula. Error hints include the deduplicated model count plus requested outputs per model and do not reuse the 017 single-call `distinct_requested_models: 1` hint.
- [ ] **ac-rate-limit-grid-prediction-requests:** Data-grid ML prediction loading debounces visible-range changes, coalesces duplicate request signatures and ignores stale responses from superseded scroll/zoom ranges; the backend has an authenticated-session concurrency guard for grid prediction requests.
- [ ] **ac-handle-partial-ml-grid-results:** Data-grid ML columns render available prediction timestamps, render `nil` for missing timestamps, place `nil` values last when sorting ML columns, exclude `nil` from numeric range filters, and keep sorting/filtering usable for the rest of the rows. Diagnostics distinguish not-yet-computed values from source-window mismatches caused by guarded-upsert stale-snapshot skips.
- [ ] **ac-isolate-grid-column-errors:** Missing, invalid or failed-serving model references in a grid column show a visible column error, return `nil` values for that column, and leave other columns usable.
- [ ] **ac-admin-ui-states:** The internal UI has deterministic loading, empty, queued/running, succeeded and failed states for models and training runs, including latest failed retrain while prior serving weights remain active.
- [ ] **ac-training-progress-ui:** Training UI can create/cancel runs, subscribe to progress, and recover from reconnect/reload through API state.
- [ ] **ac-model-key-autocomplete:** System editor autocomplete fetches available model keys through `GET /api/ml/models/autocomplete` with prefix search, capped `{ models, meta }` responses and a truncated/has-more indicator, while plain `GET /api/ml/models` remains the 017 list contract and neither path loads weight blobs.
- [ ] **ac-expand-state-risk-catalogue:** Deferred state/risk/normalization modules are implemented as Research modules with schema, metadata, docs and LLM reference coverage; specs pin proxy heuristics and reject cross-symbol/cross-timeframe input refs.
- [ ] **ac-preserve-existing-workspace-state:** Existing tabs, presets and data-grid configs without ML columns restore unchanged after the new column/tab types are introduced.
- [ ] **ac-migrate-workspace-store-compatibly:** Tab/preset hydration tolerates legacy payloads, missing ML tab fields and unknown future tab/column types without breaking the rest of the workspace, and preserves unknown payloads through load-save round trips.
- [ ] **ac-export-ml-grid-columns:** CSV export uses ML column labels for headers, exports prediction values from stable internal field keys and writes blank cells for missing/error values.

## Implementation Constraints

- Depend on feature 017 contracts; do not change 017 storage/training checksums without a 017 spec update.
- Do not add new gems or npm packages without approval.
- Keep API controllers thin and reuse `Ml::InferenceService`.
- Keep frontend state backward compatible with existing `Preset.payload` and localStorage data.
- Keep model list responses free of weight payloads.
- Preserve the final 017 plain `GET /api/ml/models` array response for model lists unless 017 API docs/request specs are intentionally updated in the same change; use the autocomplete collection endpoint for `{ models, meta }`.
- Do not add tight custom ActionCable reconnect loops; rely on the shared consumer behavior or backoff retries.
- Cross-symbol/cross-timeframe feature inputs are out of scope for 018; do not silently reinterpret such refs as current-series data.
- Keep feature/task numbers out of runtime code, API/UI messages and executable spec names.
- Normalize external payloads once at the controller/YAML/API boundary, then use canonical keys and fail fast; no fallback helpers for alternate key shapes or extreme numeric guards.
