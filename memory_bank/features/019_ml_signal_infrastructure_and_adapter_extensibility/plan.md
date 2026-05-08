# ML Signal Infrastructure and Adapter Extensibility — Plan

**Spec:** `memory_bank/features/019_ml_signal_infrastructure_and_adapter_extensibility/spec.md`

## Approach

Keep this as a clarification and small catalog cleanup, not a registry framework.

The implementation starts with documentation because the primary deliverable is a correct mental model of the shipped ML signal pipeline. Only after the current training/inference paths are documented do we consolidate the few scattered baseline support constants into a lightweight `Ml::AdapterCatalog`.

No second runtime adapter is added. Extensibility is proven with a test-only fake adapter wired through the same catalog boundary. The public `baseline_direction_classifier` architecture string, `baseline_direction_classifier:v1` weight format, existing model records and existing API behavior remain unchanged. Baseline is described as a temporary lifecycle smoke-test adapter, not as a durable modeling template or predictive-edge claim.

Rollback is a code/docs revert: this feature must not add migrations, dependencies or persisted string changes.

## Implementation Steps

### 1. Document Current ML Signal Pipeline

**Files:** `docs/12-ml-signal-infrastructure.md` (new), `README.md` (modify), `docs/05-api.md` (modify), `docs/09-research-systems.md` (modify), `docs/11-developer-workflow.md` (modify if this is the current developer-facing index)

**Change:** Add a developer-facing explanation of the shipped ML signal infrastructure before changing code. Include training and inference flow diagrams, the boundary between signal infrastructure and modeling platform, current capabilities, and the exact role of `baseline_direction_classifier` as a temporary smoke-test adapter. State explicitly that baseline can be removed by a later brief once a real adapter covers the same lifecycle smoke tests.

**Check:** `bin/memory-bank-check`

**AC:** `ac-document-current-ml-signal-flow`, `ac-position-baseline-as-smoke-test-adapter`, `ac-keep-non-ml-product-scope-separate`

### 2. Add Lightweight Adapter Catalog and Wiring

**Files:** `app/services/ml/adapter_catalog.rb` (new), `app/models/ml_model.rb` (modify), `app/models/ml_model_weight_blob.rb` (modify), `app/services/ml/training_run_lifecycle.rb` (modify), `app/services/ml/training_runner.rb` (modify), `app/services/ml/inference_service.rb` (modify), related RBS files under `sig/app/models/` and `sig/app/services/ml/` (modify only if public signatures change), `spec/services/ml/adapter_catalog_spec.rb` (new)

**Change:** Add `Ml::AdapterCatalog` as one canonical source of current adapter support metadata using an explicit frozen map/hash. It should expose current architectures, weight formats, default architecture, outputs, prediction target, default hyperparams and adapter factory for the existing baseline adapter. Existing public constants such as `MlModel::ARCHITECTURES` and `MlModelWeightBlob::SUPPORTED_FORMATS` may remain for compatibility/readability, but they must derive from the catalog to avoid drift. Preserve optional adapter injection in `TrainingRunner` and `InferenceService` for focused tests.

**Check:** `bundle exec rspec spec/services/ml/adapter_catalog_spec.rb spec/models/ml_model_spec.rb spec/models/ml_model_weight_blob_spec.rb spec/services/ml/training_run_lifecycle_spec.rb spec/services/ml/training_runner_spec.rb spec/services/ml/inference_service_spec.rb && bundle exec steep check`

**AC:** `ac-introduce-adapter-catalog`, `ac-route-architecture-through-catalog`, `ac-preserve-baseline-compatibility`, `ac-cover-catalog-boundary-types`

### 3. Prove Catalog Extensibility With Test-Only Fake Adapter

**Files:** `spec/services/ml/adapter_catalog_spec.rb` (modify), `spec/services/ml/training_runner_spec.rb` (modify), `spec/services/ml/inference_service_spec.rb` (modify), test support file if needed under `spec/support/` (new | modify)

**Change:** Add a test-only fake adapter registered through the catalog boundary and prove that training and inference can use it without editing `Ml::TrainingRunLifecycle`, `Ml::TrainingRunner`, `Ml::InferenceService`, `MlModel` or `MlModelWeightBlob` for that fake. The fake adapter must not be exposed in production/runtime supported architectures.

**Check:** `bundle exec rspec spec/services/ml/adapter_catalog_spec.rb spec/services/ml/training_runner_spec.rb spec/services/ml/inference_service_spec.rb`

**AC:** `ac-prove-catalog-extensibility`, `ac-route-architecture-through-catalog`

### 4. Baseline Compatibility and Error Regression Coverage

**Files:** `spec/models/ml_model_spec.rb` (modify), `spec/models/ml_model_weight_blob_spec.rb` (modify), `spec/services/ml/training_run_lifecycle_spec.rb` (modify), `spec/services/ml/training_runner_spec.rb` (modify), `spec/services/ml/inference_service_spec.rb` (modify), `spec/requests/api/ml_training_runs_spec.rb` (modify), `spec/requests/api/ml_predictions_spec.rb` (modify if endpoint behavior is touched)

**Change:** Add focused regression coverage proving current public contracts remain stable and error paths stay structured. Cover: unsupported architecture, unsupported prediction target, unsupported weight format, unsupported output, default training-run architecture, accepted baseline weight format, current prediction outputs and absence of a second runtime architecture.

**Check:** `bundle exec rspec spec/models/ml_model_spec.rb spec/models/ml_model_weight_blob_spec.rb spec/services/ml/training_run_lifecycle_spec.rb spec/services/ml/training_runner_spec.rb spec/services/ml/inference_service_spec.rb spec/requests/api/ml_training_runs_spec.rb spec/requests/api/ml_predictions_spec.rb`

**AC:** `ac-preserve-baseline-compatibility`, `ac-cover-adapter-error-regressions`, `ac-position-baseline-as-smoke-test-adapter`

### 5. Future Tracks Artifact

**Files:** `memory_bank/features/019_ml_signal_infrastructure_and_adapter_extensibility/future-tracks.md` (new), `memory_bank/features/coverage.md` (modify if useful as an index pointer)

**Change:** Create one stable future-track artifact for advanced ML work. Record `torch-rb` feasibility spike, sequence dataset support, simple torch adapter before LNN, LNN/LTC/CfC research, walk-forward/evaluation harness and the rule that each track needs its own future brief/spec before implementation.

**Check:** `bin/memory-bank-check`

**AC:** `ac-document-future-neural-track`, `ac-keep-non-ml-product-scope-separate`

### 6. Final Verification and Current Focus

**Files:** `memory_bank/process/current-focus.md` (modify), feature review artifacts as needed

**Change:** Run focused checks, Steep and memory-bank validation. Update current focus according to workflow. Do not mark done until `reviews/impl.md` exists and is non-blocking.

**Check:** commands in Verification section

**AC:** `ac-document-current-ml-signal-flow`, `ac-position-baseline-as-smoke-test-adapter`, `ac-introduce-adapter-catalog`, `ac-route-architecture-through-catalog`, `ac-prove-catalog-extensibility`, `ac-preserve-baseline-compatibility`, `ac-cover-adapter-error-regressions`, `ac-cover-catalog-boundary-types`, `ac-document-future-neural-track`, `ac-keep-non-ml-product-scope-separate`

## Verification

```bash
bundle exec rspec spec/services/ml/adapter_catalog_spec.rb spec/models/ml_model_spec.rb spec/models/ml_model_weight_blob_spec.rb spec/services/ml/training_run_lifecycle_spec.rb spec/services/ml/training_runner_spec.rb spec/services/ml/inference_service_spec.rb spec/requests/api/ml_training_runs_spec.rb spec/requests/api/ml_predictions_spec.rb
bundle exec steep check
bin/memory-bank-check
```
