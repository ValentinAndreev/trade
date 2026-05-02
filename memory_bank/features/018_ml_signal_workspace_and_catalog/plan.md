# ML Signal Workspace and Catalogue — Plan

**Spec:** `memory_bank/features/018_ml_signal_workspace_and_catalog/spec.md`

## Approach

Layer UI/data-grid/catalog expansion on top of feature 017. Do not alter 017 storage or training contracts unless a separate 017 spec change is approved.

New Ruby public classes get RBS files in the same implementation slice that introduces them. Final verification runs `bundle exec steep check`.

Data-grid ML prediction rows use stable field keys derived from the column id, not from editable labels: `columnFieldKey(col)` returns `ml_prediction:<column_id>` for `ml_prediction` columns. Request/response payloads carry the same `column_id`, so duplicate model/output columns and column renames do not collide.

The data-grid prediction endpoint accepts optional `exchange` and defaults to the shared candle-query default exchange, currently `bitfinex`. Do not hard-code the literal in the controller; introduce or reuse a shared default such as `Candle::FindQuery::DEFAULT_EXCHANGE`. The backend passes the resolved exchange into 017 `Ml::InferenceService` and echoes it in the response contract.

Expanded transform modules use a shared input-reference schema instead of ad hoc params. Single-input modules use `input`; pair modules use `left`/`right`. Each reference is one of `{ kind: "ohlcv", field: "close" }`, `{ kind: "module", alias: "module_alias", output: "value" }`, or `{ kind: "external_series", key: "vix", output: "value" }`. In 018, `ohlcv` and `module` refs are scoped to the current `(exchange, symbol, timeframe)` series; refs that try to specify another exchange, symbol or timeframe are rejected rather than silently coerced. `external_series` refs reuse the existing no-lookahead alignment: the stored `MacroSeries.ts`/series timestamp is treated as the availability timestamp, values are carried forward only after that timestamp, there is no future fill or interpolation, and values are `nil` before the first known value. Validation rejects unknown refs, missing output fields and refs whose metadata cannot prove no-lookahead behavior. This schema applies to 018 transform-like modules; the minimal 017 modules keep their existing simple params unless a future refactor retrofits them.

## Implementation Steps

### 1. Expanded State/Risk Module Catalogue

**Files:** `app/services/research/modules/input_resolver.rb` (new), `app/services/research/modules/rolling_corr.rb` (new), `app/services/research/modules/spread.rb` (new), `app/services/research/modules/ratio.rb` (new), `app/services/research/modules/stationarity_proxy.rb` (new), `app/services/research/modules/heteroskedasticity_proxy.rb` (new), `app/services/research/modules/zscore.rb` (new), `app/services/research/modules/robust_zscore.rb` (new), `app/services/research/modules/minmax_position.rb` (new), `app/services/research/modules/lag.rb` (new), `app/services/research/modules/delta.rb` (new), `app/services/research/modules/rolling_mean.rb` (new), `app/services/research/modules/rolling_std.rb` (new), `app/services/research/modules/ema_smoother.rb` (new), `app/services/research/modules/clip.rb` (new), `app/services/research/modules/winsorize.rb` (new), `config/configs/indicators_config.rb` (modify), `app/services/research/systems/schema.rb` (modify), `app/services/research/systems/validation/validator.rb` (modify), `app/services/llm/system_editor/knowledge_base.rb` (modify), `app/prompts/llm/system_editor/modules_meta.yml` (modify), `spec/services/research/modules/state_risk_transforms_spec.rb` (new), `spec/services/research/modules/state_risk_pair_proxy_spec.rb` (new), `spec/services/research/modules/input_resolver_spec.rb` (new), `spec/services/research/systems/validation/validator_spec.rb` (modify), `spec/services/llm/system_editor/knowledge_base_spec.rb` (modify), `sig/app/services/research/modules/input_resolver.rbs` (new), `sig/app/services/research/modules/rolling_corr.rbs` (new), `sig/app/services/research/modules/spread.rbs` (new), `sig/app/services/research/modules/ratio.rbs` (new), `sig/app/services/research/modules/stationarity_proxy.rbs` (new), `sig/app/services/research/modules/heteroskedasticity_proxy.rbs` (new), `sig/app/services/research/modules/zscore.rbs` (new), `sig/app/services/research/modules/robust_zscore.rbs` (new), `sig/app/services/research/modules/minmax_position.rbs` (new), `sig/app/services/research/modules/lag.rbs` (new), `sig/app/services/research/modules/delta.rbs` (new), `sig/app/services/research/modules/rolling_mean.rbs` (new), `sig/app/services/research/modules/rolling_std.rbs` (new), `sig/app/services/research/modules/ema_smoother.rbs` (new), `sig/app/services/research/modules/clip.rbs` (new), `sig/app/services/research/modules/winsorize.rbs` (new)

**Change:** Implement the deferred modules from 017 as first-class Research modules with warmup, lookahead, output-field and formula metadata. Add `Research::Modules::InputResolver` for the shared `input`/`left`/`right` schema described above. Keep all modules no-lookahead unless explicitly blocked from ML feature specs. Split implementation/review checkpoints and specs inside this step into transform modules first (`state_risk_transforms_spec.rb`: `lag`, `delta`, `rolling_mean`, `rolling_std`, `ema_smoother`, `clip`, `winsorize`, `zscore`, `robust_zscore`, `minmax_position`) and pair/proxy modules second (`state_risk_pair_proxy_spec.rb`: `rolling_corr`, `spread`, `ratio`, `stationarity_proxy`, `heteroskedasticity_proxy`) to keep review surface bounded. `rolling_corr`, `spread` and `ratio` operate on same-series resolved inputs; cross-symbol/timeframe refs are structured validation errors. Pair modules may use `external_series` refs after last-known-at-or-before alignment; tests must cover sparse macro daily data aligned to denser candles without future leakage and the boundary where an external-series timestamp is exactly equal to the candle timestamp (`<=`, not `<`). Pin proxy heuristics in module metadata and specs: `stationarity_proxy = 1 - clamp(abs(mean_current_window - mean_previous_window) / (std_combined_window + epsilon), 0, 1)` and `heteroskedasticity_proxy = clamp(abs(var_current_window - var_previous_window) / (var_combined_window + epsilon), 0, 1)`, with warmup covering both adjacent windows. Descriptions must call them drift/variance heuristics and not statistical stationarity or heteroskedasticity tests. Add validation coverage for invalid input refs, missing output fields, refs with unknown lookahead/warmup metadata, and existing feature-009 YAML fixture systems so validator changes do not break pre-ML systems.

**Check:** `bundle exec rspec spec/services/research/modules/state_risk_transforms_spec.rb spec/services/research/modules/state_risk_pair_proxy_spec.rb spec/services/research/modules/input_resolver_spec.rb spec/services/research/systems/validation/validator_spec.rb spec/services/llm/system_editor/knowledge_base_spec.rb`

**AC:** `ac-expand-state-risk-catalogue`

### 2. Data-Grid Prediction API

**Files:** `app/controllers/api/ml/predictions_controller.rb` (new), `config/routes.rb` (modify), `spec/requests/api/ml_predictions_spec.rb` (new), `sig/app/controllers/api/ml/predictions_controller.rbs` (new)

**Change:** Add authenticated endpoint accepting ML column specs plus symbol/timeframe/range and optional `exchange` defaulting through the shared candle default exchange. Introduce or reuse a shared Ruby constant for `MAX_PREDICTION_CELLS = 50_000`, expose it in prediction error payloads and as `meta.max_prediction_cells` on the capped `/api/ml/models` payload used by the UI, and keep frontend tests pinned to that fixture so backend/frontend caps do not drift silently. Enforce the 017 single-market formula `candle_count * distinct(modelKey, modelOutput)` after column validation/deduplication, pass resolved exchange into 017 `Ml::InferenceService`, echo exchange in the response, and return per-column timestamp-keyed values plus structured errors keyed by `column_id`. Add a small authenticated-session concurrency guard for grid prediction requests in MVP: a second concurrent request for the same session returns a structured retryable error instead of starting another in-process inference. Request specs cover 401 authentication parity with `Api::Ml::ModelsController`, explicit exchange, default exchange, over-cap rejection, duplicate columns for one model/output pair, partial responses, invalid model columns, SQL-looking `model_key` input returning structured validation rather than SQL errors, and the concurrency guard.

**Check:** `bundle exec rspec spec/requests/api/ml_predictions_spec.rb`

**AC:** `ac-serve-grid-predictions`, `ac-cap-grid-prediction-cells`, `ac-rate-limit-grid-prediction-requests`, `ac-handle-partial-ml-grid-results`, `ac-isolate-grid-column-errors`

### 3. Data-Grid Column State and Rendering

**Files:** `app/javascript/types/store.ts` (modify), `app/javascript/data_grid/data_loader.ts` (modify), `app/javascript/data_grid/grid_config.ts` (modify), `app/javascript/controllers/data_grid_controller.ts` (modify), `app/javascript/templates/data_grid_form_templates.ts` (modify), `app/javascript/tabs/data_actions/column_actions.ts` (modify), `app/javascript/__tests__/data_grid/ml_prediction_columns.test.ts` (new), `app/javascript/__tests__/tabs/config.test.ts` (modify), `app/javascript/__tests__/tabs/persistence.test.ts` (modify)

**Change:** Add `ml_prediction` column shape, sidebar controls, loader/server-column logic, client-side cap preflight using the distinct-pair formula and local merge of values/errors. Debounce visible-range ML prediction requests with a trailing 300 ms window, enforce one in-flight request per data tab and a minimum 300 ms interval between fired prediction requests, coalesce duplicate request signatures per data tab, abort superseded in-flight HTTP requests with `AbortController` when the visible range/signature changes, and ignore stale responses that still arrive from superseded scroll/zoom ranges. Extend `columnFieldKey` so `ml_prediction` uses `ml_prediction:<column_id>` rather than label/model/output. Reuse existing candle/indicator cache fallback; persisted server predictions remain the ML reuse layer and are reused by `(model_key, output, ts, exchange, symbol, timeframe)` independently of regenerated frontend column ids. Sorting an ML column places `nil` values last in both directions, numeric range filters exclude `nil`, and CSV export uses the column label for the header while reading values from `columnFieldKey(col)` so `ml_prediction:<column_id>` never appears as a user-facing header. Tests cover duplicate model/output columns, column rename, clone-tab behavior with regenerated column ids, server prediction reuse independent of `column_id`, persisted width/order restore for stable ids, persisted restore, local errors keyed by column id, nil sort/filter behavior and CSV export headers/blank missing values.

**Check:** `npm test -- app/javascript/__tests__/data_grid/ml_prediction_columns.test.ts app/javascript/__tests__/tabs/config.test.ts app/javascript/__tests__/tabs/persistence.test.ts && npm run typecheck`

**AC:** `ac-add-ml-grid-column`, `ac-cap-grid-prediction-cells`, `ac-rate-limit-grid-prediction-requests`, `ac-handle-partial-ml-grid-results`, `ac-isolate-grid-column-errors`, `ac-preserve-existing-workspace-state`, `ac-export-ml-grid-columns`

### 4. ML Models Workspace Tab

**Files:** `app/javascript/types/store.ts` (modify), `app/javascript/tabs/store.ts` (modify), `app/javascript/tabs/panel_renderer.ts` (modify), `app/javascript/tabs/renderer.ts` (modify), `app/javascript/templates/panel_templates.ts` (modify), `app/javascript/ml/api.ts` (new), `app/javascript/ml/templates.ts` (new), `app/javascript/controllers/ml_models_controller.ts` (new), `app/javascript/controllers/index.ts` (modify), `app/javascript/__tests__/ml/models_ui.test.ts` (new), `app/javascript/__tests__/tabs/store.test.ts` (modify), `app/javascript/__tests__/tabs/persistence.test.ts` (modify)

**Change:** Add workspace tab type, quick-launch entry, model/run list rendering, deterministic states and no-weight-payload assertions. The tab is visible only inside the authenticated workspace; API calls handle 401 by rendering the same signed-out/error boundary as existing authenticated workspace surfaces. Consume the 017 `latest_failed_training_run_id`/run payload for the latest-failed-retrain state instead of issuing a separate latest-failure query per render. Add a store hydration/migration path for the expanded tab union: legacy tabs get defaults, unknown future tab types or column types are not rendered but are preserved as opaque payloads through load-save round trips, and existing localStorage/Preset payloads continue restoring. Document that this is forward-compatible hydration only; rolling back to pre-018 code after saving ML tabs/columns may leave those presets unreadable without restoring an older preset backup.

**Check:** `npm test -- app/javascript/__tests__/ml/models_ui.test.ts app/javascript/__tests__/tabs/store.test.ts app/javascript/__tests__/tabs/persistence.test.ts && npm run typecheck`

**AC:** `ac-admin-ui-states`, `ac-preserve-existing-workspace-state`, `ac-migrate-workspace-store-compatibly`

### 5. Training Progress UI and Autocomplete

**Files:** `app/javascript/ml/progress_subscription.ts` (new), `app/javascript/controllers/ml_models_controller.ts` (modify), `app/javascript/ml/templates.ts` (modify), `app/javascript/system_editor/autocomplete.ts` (modify), `app/javascript/__tests__/ml/progress_subscription.test.ts` (new), `app/javascript/__tests__/ml/models_ui.test.ts` (modify), `app/javascript/__tests__/system_editor/autocomplete.test.ts` (new), `spec/requests/api/ml_models_spec.rb` (modify if pagination/cap contract needs backend coverage)

**Change:** Add create/cancel controls, subscribe to `MlTrainingProgressChannel`, refresh API state on reconnect/reload and fetch model keys from capped `/api/ml/models?q=prefix&limit=50` responses. The model list response includes `truncated`/`has_more`; autocomplete shows a refine-query state instead of silently hiding matches beyond the cap. At the start of 018 implementation, compare the create-run payload against the final 017 request specs for the first-registration flow; if 017 diverges from its current contract, update the 017 spec/plan before adding a frontend-only workaround. Use the shared ActionCable consumer reconnect behavior or an explicit backoff for API refresh retries; do not add a tight manual reconnect loop. Subscription rejection, 401, or unknown run id is rendered as a local training UI error and followed by an API-state refresh, not by immediate resubscribe loops. The create-run payload must reuse the 017 first-registration contract as finalized by 017; 018 does not introduce a frontend-only draft-model shape.

**Check:** `npm test -- app/javascript/__tests__/ml/progress_subscription.test.ts app/javascript/__tests__/ml/models_ui.test.ts app/javascript/__tests__/system_editor/autocomplete.test.ts && npm run typecheck`

**AC:** `ac-training-progress-ui`, `ac-model-key-autocomplete`, `ac-admin-ui-states`

### 6. RBS, Documentation and Verification

**Files:** `docs/05-api.md` (modify), `docs/06-ui-workflows.md` (modify), `docs/09-research-systems.md` (modify), `docs/10-llm-assistant.md` (modify)

**Change:** Audit RBS files introduced in steps 1-2, then document grid prediction endpoint including exchange default, stable ML column field keys, workspace ML tab, autocomplete, frontend cap behavior, input-reference schema and expanded module catalogue.

**Check:** `bundle exec steep check && bin/memory-bank-check`

**AC:** `ac-add-ml-grid-column`, `ac-serve-grid-predictions`, `ac-admin-ui-states`, `ac-expand-state-risk-catalogue`

## Verification

```bash
bundle exec rspec spec/services/research/modules/state_risk_transforms_spec.rb spec/services/research/modules/state_risk_pair_proxy_spec.rb spec/services/research/modules/input_resolver_spec.rb spec/services/research/systems/validation/validator_spec.rb spec/services/llm/system_editor/knowledge_base_spec.rb spec/requests/api/ml_predictions_spec.rb spec/requests/api/ml_models_spec.rb
bundle exec rspec spec/services/ml/source_window_checksum_spec.rb spec/services/ml/inference_service_spec.rb
npm test -- app/javascript/__tests__/data_grid/ml_prediction_columns.test.ts app/javascript/__tests__/ml/models_ui.test.ts app/javascript/__tests__/ml/progress_subscription.test.ts app/javascript/__tests__/system_editor/autocomplete.test.ts app/javascript/__tests__/tabs/config.test.ts app/javascript/__tests__/tabs/persistence.test.ts app/javascript/__tests__/tabs/store.test.ts
npm run typecheck
bundle exec steep check
bin/rubocop
bin/brakeman --no-pager
bin/bundler-audit
npm audit --audit-level=high
bin/memory-bank-check
git diff --check
```
