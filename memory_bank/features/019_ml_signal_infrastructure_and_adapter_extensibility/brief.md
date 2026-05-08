# ML Signal Infrastructure and Adapter Extensibility — Brief

## Goal

Clarify and stabilize the existing ML subsystem as an extensible infrastructure layer for model-backed signals, not as a full ML/modeling platform.

The immediate goal is to make the current implementation understandable and intentionally extensible:

- what already works end to end;
- why the current `baseline_direction_classifier` is a temporary smoke-test adapter rather than a claim of predictive edge;
- where a future model family should plug in;
- which small catalog/boundary cleanup is useful before considering heavier engines such as `torch-rb`;
- how to keep ML useful without letting it become the main application track by accident.

## For Whom

This is for the project owner / developer / trader-researcher who is returning deeper into programming and needs an accurate mental model of the ML layer before deciding whether to continue with advanced ML work or return focus to the LLM harness/process direction.

The workflow to support is:

- inspect the current ML training and inference flow without reading every file from scratch;
- understand which parts are reusable infrastructure and which parts are temporary smoke-test model implementation;
- use the current ML signal path in Research YAML and data grid with honest expectations;
- keep future ML research questions separate from the current app roadmap until a dedicated brief exists.

## Domain Context

Features 017 and 018 already shipped a full ML signal contour:

```text
candles -> Research module features -> training dataset -> training run
-> model weights -> inference -> persisted predictions
-> data grid ML columns / Research ml_signal module
```

The important distinction:

- **ML signal infrastructure** means lifecycle, storage, inference reuse, prediction cache, YAML integration, grid integration, progress, cancellation and structured errors.
- **Modeling platform** means multiple serious model families, sequence datasets, evaluation harnesses, neural training loops, artifact migration, CPU/GPU resource policy and deployment support.

The current system is much closer to the first category. That is useful and intentional, but it should be documented and shaped clearly so future work does not mistake a temporary smoke-test adapter for a mature modeling platform.

## Current State

The current ML implementation includes real infrastructure:

- `MlModel` stores a global authenticated-app model registry with stable `key`, `architecture`, `prediction_target`, serving status, metrics and serving checksum.
- `MlTrainingRun` stores immutable run snapshots: dataset spec, resolved feature spec, hyperparams, seed, metrics, fitted metadata, error metadata, heartbeat and cancellation state.
- `MlModelWeightBlob` stores durable weights/artifacts with checksum and byte-size guard.
- `Ml::DatasetBuilder` and `Ml::FeatureMatrix` build training/inference rows from candles and Research module outputs.
- `Ml::TrainingRunner` orchestrates dataset building, adapter training, run state transitions, weight persistence and model serving pointer updates.
- `Ml::InferenceService` captures an immutable serving snapshot, builds inference features, computes missing/stale predictions in batches and returns aligned prediction series.
- `Ml::PredictionRepository` persists successful predictions in `ml_predictions` and reuses them when checksum/source-window contracts still match.
- `ml_predictions` is a TimescaleDB hypertable keyed for reproducible prediction reuse by model, market tuple, timestamp and weight checksum.
- `Research::Modules::MlSignal` exposes trained model predictions inside YAML systems as module values.
- Data-grid `ml_prediction` columns expose model outputs in the workspace and isolate per-column errors.
- ML models workspace UI exposes model/run state, training creation, cancellation and progress.

The current adapter is:

```text
baseline_direction_classifier
```

It is useful because it proves that the full path works:

```text
training request -> dataset -> adapter train -> weights -> inference
-> persisted predictions -> grid/research consumption
```

It should not be presented as a strong market model. It is a temporary smoke-test adapter for the ML lifecycle. It can be removed by a future brief once the first real adapter covers the same lifecycle checks.

The current gap is conceptual and architectural:

- the code and documentation do not make the adapter boundary explicit enough;
- `baseline_direction_classifier` can look like the center of the ML system instead of one implementation;
- the few existing baseline support values are scattered across models, services and weight validation;
- advanced neural work requires additional research around dataset shape, sequence windows, evaluation and deployment before implementation.

## Requirements

- Document the existing ML subsystem as **ML signal infrastructure** with clear training, inference, prediction reuse, Research YAML and data-grid flows.
- Explain why `baseline_direction_classifier` exists and why it is a temporary smoke-test adapter rather than a predictive-edge claim.
- Identify the stable infrastructure contracts that future adapters should reuse: model registry, training runs, weights, inference service, prediction repository, `ml_signal`, grid columns, progress, cancellation and structured errors.
- Identify the current baseline-specific coupling points that make extension less obvious.
- Consolidate current adapter support metadata in one lightweight catalog rather than designing a full registry before a second real adapter exists.
- Define the intended near-term catalog boundary in product/engineering terms:

  ```text
  architecture -> adapter -> weights_format -> supported prediction target -> supported outputs
  ```

- Preserve the current in-process Ruby adapter style as the near-term extension model.
- Prove extensibility with a test-only fake adapter if code changes need such proof; do not expose a second runtime adapter.
- Record `torch-rb`, sequence datasets, LNN/LTC/CfC adapters and walk-forward evaluation as future research/spike tracks, not as part of this task.
- Keep the main application direction clear: research workspace and LLM harness/process remain the primary product track; ML remains a signal infrastructure layer unless a later brief explicitly changes that priority.

## Non-Scope

- Adding `torch-rb`.
- Adding a public second runtime adapter.
- Implementing neural-network adapters.
- Implementing LNN, LTC, CfC, LSTM, GRU or other sequence models.
- Adding GPU, CUDA or MPS support.
- Adding Python sidecars, ONNX import/export or remote model serving.
- Building AutoML, model farms or a general modeling platform.
- Adding hyperparameter optimization UI for ML models.
- Claiming or optimizing predictive edge for `baseline_direction_classifier`.
- Changing `Preset.payload`, localStorage, IndexedDB or Research YAML storage contracts.
- Reworking the shipped prediction storage schema beyond what is needed to document or clarify existing extension boundaries.
