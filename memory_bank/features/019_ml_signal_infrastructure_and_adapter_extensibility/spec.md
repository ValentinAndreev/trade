# ML Signal Infrastructure and Adapter Extensibility — Spec

**Brief:** `memory_bank/features/019_ml_signal_infrastructure_and_adapter_extensibility/brief.md`

## Goal

Make the shipped ML signal layer understandable and explicitly extensible while preserving current runtime behavior and deferring advanced neural modeling to a future research track.

## Scope

In:
- Document the current ML training, inference, prediction reuse, Research YAML and data-grid flows as signal infrastructure.
- Position `baseline_direction_classifier` as the current temporary smoke-test adapter for the ML lifecycle.
- Introduce a lightweight adapter catalog for the existing in-process Ruby adapter style.
- Route existing supported architecture, adapter selection, weights format and supported output metadata through one canonical catalog boundary.
- Preserve the current baseline training/inference/API behavior.
- Add focused tests and RBS coverage for the adapter boundary if new public Ruby classes or methods are introduced.
- Record future `torch-rb`, sequence datasets, LNN/LTC/CfC and walk-forward evaluation work as deferred research/spike tracks.

Out:
- Adding a second runtime adapter.
- Adding `torch-rb` or any new gem/package.
- Implementing neural-network, sequence or liquid-network models.
- Changing `ml_predictions`, model/run storage schema, `Preset.payload`, localStorage, IndexedDB or Research YAML contracts.
- Building model quality evaluation, walk-forward validation, AutoML or hyperparameter optimization UI.
- Making LLM harness/process changes; that remains a separate package.

## Requirements

1. Documentation must describe the current ML subsystem as model-backed signal infrastructure, not as a mature modeling platform.
2. Documentation must explain the current end-to-end training path:

   ```text
   training API -> Ml::TrainingRunLifecycle -> MlTrainingJob -> Ml::TrainingRunner
   -> Ml::DatasetBuilder / Ml::FeatureMatrix -> adapter train
   -> MlModelWeightBlob -> model serving pointer
   ```

3. Documentation must explain the current inference/reuse path:

   ```text
   grid prediction API or Research::Modules::MlSignal
   -> Ml::InferenceService -> serving snapshot -> feature matrix
   -> adapter predict -> Ml::PredictionRepository -> ml_predictions
   ```

4. Documentation must state that `baseline_direction_classifier` is a temporary smoke-test adapter. It proves lifecycle and integration contracts, but it must not be described as a strong trading model, future adapter template or predictive-edge claim.
5. The current useful capabilities must be explicit: train a baseline model, persist weights, compute/reuse predictions, expose `probability`/`direction`/`confidence`, use `ml_signal` in Research YAML and show ML prediction columns in data grid.
6. The implementation must expose a single canonical adapter catalog boundary for current architecture metadata. The catalog contract must include at least:
   - `architecture`;
   - adapter class or factory;
   - `weights_format`;
   - supported `prediction_target`;
   - supported outputs;
   - default adapter hyperparams.
7. Supported architecture lists, training defaults, adapter instantiation, weight-format support and inference compatibility must derive from the same catalog contract rather than independent hard-coded baseline constants.
8. The catalog must use explicit enum/map dispatch. It must not use `send`, `public_send`, dynamic constant lookup, `const_get` or runtime metaprogramming.
9. Existing `baseline_direction_classifier` behavior remains backward compatible:
   - existing model keys and architecture values remain valid;
   - existing baseline weight blobs remain loadable;
   - existing `weights_format` value remains valid;
   - existing training-run API default architecture remains `baseline_direction_classifier`;
   - existing prediction outputs remain `probability`, `direction` and `confidence`.
10. Adapter errors remain structured service/API errors. Unsupported architectures, unsupported weight formats, incompatible prediction targets and unsupported outputs must fail with structured diagnostics.
11. A test-only fake adapter must be usable through the same catalog boundary to prove that catalog-driven training and inference can exercise another adapter without changing `Ml::TrainingRunLifecycle`, `Ml::TrainingRunner`, `Ml::InferenceService`, `MlModel` or `MlModelWeightBlob`. The fake adapter must not be exposed as a runtime/user-visible architecture.
12. No second runtime adapter is part of this feature.
13. Advanced neural work must be recorded as future scope, including at least:
   - `torch-rb` feasibility spike;
   - sequence dataset support;
   - simple torch adapter before LNN;
   - LNN/LTC/CfC adapter research;
   - walk-forward/evaluation harness.
14. LLM harness/process remains outside this feature. 019 may document product positioning, but it must not add LLM runtime behavior, tools or assistant workflow changes.

## Invariants

- Server candles remain the source of truth for ML training, inference and Research backtests.
- Prediction values are still stored only for successful predictions; failures stay in service/API/run metadata.
- `ml_predictions` remains keyed by model, market tuple, timestamp and `weight_checksum` for reproducible prediction reuse.
- A serving snapshot remains immutable within an inference operation.
- Feature and source-window checksum behavior remains unchanged except where documentation clarifies the current contract.
- Existing baseline model records, training runs and weight blobs remain compatible.
- `baseline_direction_classifier` may be removed or replaced only by a future brief after a real adapter covers the same lifecycle smoke-test behavior.
- API and frontend contracts for ML models, training runs, predictions and data-grid columns remain backward compatible.
- No storage migration is required for this feature.
- No new dependency is introduced.
- Future `torch-rb`/sequence/LNN work requires a separate brief/spec before implementation.

## Acceptance Criteria

- [ ] **ac-document-current-ml-signal-flow:** Developer docs describe training, inference, prediction reuse, Research YAML and data-grid paths with concrete class/module names and without presenting baseline predictions as a trading edge.
- [ ] **ac-position-baseline-as-smoke-test-adapter:** Docs and code-facing metadata make clear that `baseline_direction_classifier` is the current temporary lifecycle smoke-test adapter, while preserving its existing public architecture string and weight format.
- [ ] **ac-introduce-adapter-catalog:** A single lightweight adapter catalog exposes architecture, adapter, weights format, prediction target, outputs and default hyperparams for the current baseline adapter.
- [ ] **ac-route-architecture-through-catalog:** Model validation, training-run lifecycle, training runner, inference service and weight-format validation use the catalog contract instead of separate baseline-only constants where those constants define adapter support.
- [ ] **ac-prove-catalog-extensibility:** A test-only fake adapter can be registered through the catalog boundary and exercised by training/inference paths without changing lifecycle, runner, inference, model or weight-blob code for that fake.
- [ ] **ac-preserve-baseline-compatibility:** Existing baseline training and inference specs still pass, and focused specs prove existing architecture strings, weight format, default training-run architecture and prediction outputs remain compatible.
- [ ] **ac-cover-adapter-error-regressions:** Unsupported architecture, unsupported weight format, unsupported prediction target and unsupported output paths are covered by focused tests and return structured diagnostics rather than generic crashes.
- [ ] **ac-cover-catalog-boundary-types:** New public Ruby catalog/boundary methods have mirrored RBS signatures if required by implementation shape, and `bundle exec steep check` passes.
- [ ] **ac-document-future-neural-track:** `memory_bank/features/019_ml_signal_infrastructure_and_adapter_extensibility/future-tracks.md` records `torch-rb`, sequence datasets, simple torch adapter, LNN/LTC/CfC and evaluation harness as future tracks outside 019.
- [ ] **ac-keep-non-ml-product-scope-separate:** 019 does not add LLM harness/process behavior and documents that such work belongs in a separate feature package.

## Implementation Constraints

- Do not add `torch-rb` or any new gem/npm dependency.
- Do not edit existing migrations; this feature should not require a migration.
- Do not change `Preset.payload`, localStorage, IndexedDB or Research YAML persisted contracts.
- Do not introduce a new runtime model architecture in this feature.
- Keep controllers thin; adapter selection and ML lifecycle behavior stay under `app/services/ml`.
- Use explicit catalog/map dispatch and avoid dynamic method or constant lookup.
- Follow canonical shape conventions: normalize external API payloads at boundaries, then use canonical keys with `fetch` inside ML services.
- Add RBS for new public Ruby classes and methods.
- Verification should include focused ML service/request specs, relevant model specs, `bundle exec steep check`, and `bin/memory-bank-check`.
- Risk/rollback: no migration or persisted string change is allowed; rollback is code/docs revert.
