# frozen_string_literal: true

FactoryBot.define do
  factory :ml_training_run do
    ml_model
    status { 'queued' }
    dataset_spec do
      {
        exchange: 'bitfinex',
        symbol: 'BTCUSD',
        timeframe: '1h',
        start_time: '2026-01-01T00:00:00Z',
        end_time: '2026-02-01T00:00:00Z'
      }
    end
    resolved_feature_spec do
      [
        {
          key: 'log_return',
          module_version: '1',
          checksum: 'module-sha256',
          params: { period: 1 },
          outputs: [ 'value' ],
          warmup: 1,
          lookahead: 0
        }
      ]
    end
    hyperparams { { seed: 0, max_iterations: 200, tolerance: 0.0001, class_weight: 'balanced' } }
    seed { 0 }
    metrics { MlTrainingRun.canonical_metrics }
    error_metadata { {} }
    fitted_metadata { {} }
    heartbeat_at { Time.current if status.in?(MlTrainingRun::ACTIVE_STATUSES) }

    trait :running do
      status { 'running' }
      started_at { Time.current }
    end

    trait :succeeded do
      status { 'succeeded' }
      metrics { MlTrainingRun.canonical_metrics(accuracy: 0.55, log_loss: 0.68, auc: 0.57, baseline_majority: 0.51) }
      weight_checksum { 'sha256-successful-run' }
      started_at { 2.minutes.ago }
      finished_at { Time.current }
      duration_ms { 120_000 }
    end

    trait :failed do
      status { 'failed' }
      error_metadata { { code: 'adapter_error', message: 'training failed' } }
      started_at { 2.minutes.ago }
      finished_at { Time.current }
      duration_ms { 120_000 }
    end

    trait :cancelled do
      status { 'cancelled' }
      cancellation_requested_at { Time.current }
      started_at { 2.minutes.ago }
      finished_at { Time.current }
      duration_ms { 120_000 }
    end
  end
end
