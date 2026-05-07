# frozen_string_literal: true

require 'rails_helper'

RSpec.describe Ml::TrainingRunner do
  let(:start_time) { Time.utc(2026, 1, 1) }
  let(:closes) { [ 100.0, 101.0, 102.0, 101.0, 100.0, 102.0, 104.0 ] }
  let(:candles) do
    closes.map.with_index do |close, index|
      {
        time: (start_time + index.minutes).to_i,
        open: close,
        high: close + 1.0,
        low: close - 1.0,
        close:,
        volume: 10.0 + index
      }
    end
  end
  let(:model) { create(:ml_model, architecture: 'baseline_direction_classifier') }
  let(:dataset_spec) do
    {
      symbol: 'BTCUSD',
      exchange: 'bitfinex',
      timeframe: '1m',
      label_horizon: 1,
      feature_spec: [ { type: 'log_return', params: { period: 1 } } ]
    }
  end
  let(:resolved_feature_spec) { Ml::FeatureWindow.new(feature_spec: dataset_spec.fetch(:feature_spec)).resolved_feature_spec }
  let(:training_run) do
    create(
      :ml_training_run,
      ml_model: model,
      dataset_spec:,
      resolved_feature_spec:,
      hyperparams: { seed: 0, max_iterations: 40, tolerance: 0.0, label_deadband_return: 0.0 }
    )
  end

  describe '#call' do
    it 'persists successful run snapshots, weights and serving model pointers' do
      result = described_class.new(training_run:, candles:).call

      expect(result).to be_success
      training_run.reload
      model.reload

      expect(training_run.status).to eq('succeeded')
      expect(training_run.resolved_feature_spec.first).to include('type' => 'log_return', 'warmup' => 1, 'lookahead' => 0)
      expect(training_run.fitted_metadata).to include('feature_names' => [ 'log_return' ], 'metrics_scope' => 'training_set')
      expect(training_run.metrics.keys).to match_array(MlModel::CANONICAL_METRIC_KEYS)
      expect(training_run.weight_checksum).to match(/\A[0-9a-f]{64}\z/)
      expect(training_run.weight_blob).to be_present
      expect(training_run.weight_blob.checksum).to eq(training_run.weight_checksum)
      expect(model.serving_status).to eq('trained')
      expect(model.latest_successful_training_run).to eq(training_run)
      expect(model.serving_weight_checksum).to eq(training_run.weight_checksum)
    end

    it 'allows deterministic retrains that produce the same weight checksum' do
      first = described_class.new(training_run:, candles:).call
      expect(first).to be_success

      second_run = create(
        :ml_training_run,
        ml_model: model,
        dataset_spec:,
        resolved_feature_spec: training_run.resolved_feature_spec,
        hyperparams: training_run.hyperparams
      )

      second = described_class.new(training_run: second_run, candles:).call

      expect(second).to be_success
      expect(second_run.reload.weight_checksum).to eq(training_run.reload.weight_checksum)
      expect(MlModelWeightBlob.where(checksum: training_run.weight_checksum).count).to eq(1)
      expect(second_run.weight_blob).to eq(training_run.weight_blob)
      expect(model.reload.latest_successful_training_run).to eq(second_run)
    end

    it 'broadcasts running, progress and succeeded events' do
      progress_broadcaster = instance_double(
        Ml::ProgressBroadcaster,
        running: nil,
        progress: nil,
        succeeded: nil
      )

      result = described_class.new(training_run:, candles:, progress_broadcaster:).call

      expect(result).to be_success
      expect(progress_broadcaster).to have_received(:running).with(training_run:)
      expect(progress_broadcaster).to have_received(:progress).at_least(:once)
      expect(progress_broadcaster).to have_received(:succeeded).with(training_run:)
    end

    it 'keeps successful terminal state when succeeded broadcast fails' do
      progress_broadcaster = instance_double(
        Ml::ProgressBroadcaster,
        running: nil,
        progress: nil,
        failed: nil
      )
      allow(progress_broadcaster).to receive(:succeeded).with(training_run:).and_raise('broadcast boom')
      allow(Rails.logger).to receive(:warn)

      result = described_class.new(training_run:, candles:, progress_broadcaster:).call

      expect(result).to be_success
      expect(training_run.reload.status).to eq('succeeded')
      expect(training_run.weight_checksum).to be_present
      expect(model.reload.serving_status).to eq('trained')
      expect(model.latest_successful_training_run).to eq(training_run)
      expect(model.latest_failed_training_run).to be_nil
      expect(model.serving_weight_checksum).to eq(training_run.weight_checksum)
      expect(progress_broadcaster).not_to have_received(:failed)
      expect(Rails.logger).to have_received(:warn).with(include('ML progress broadcast failed event=succeeded'))
    end

    it 'marks adapter failures without writing weights' do
      error = Ml::Adapters::Result::Error.new(code: :insufficient_classes, message: 'no classes', details: {})
      adapter_result = Ml::Adapters::Result::TrainingResult.new(
        status: :failed,
        weights_format: MlModelWeightBlob::BASELINE_FORMAT,
        weights_payload: nil,
        metrics: MlTrainingRun.canonical_metrics,
        fitted_metadata: {},
        diagnostics: {},
        error:
      )
      adapter = instance_double(Ml::Adapters::BaselineDirectionClassifier, train: adapter_result)
      progress_broadcaster = instance_double(Ml::ProgressBroadcaster, running: nil, failed: nil)

      result = described_class.new(training_run:, adapter:, candles:, progress_broadcaster:).call

      expect(result.status).to eq(:failed)
      expect(training_run.reload.status).to eq('failed')
      expect(training_run.weight_blob).to be_nil
      expect(model.reload.latest_failed_training_run).to eq(training_run)
      expect(progress_broadcaster).to have_received(:failed).with(training_run:)
    end

    it 'marks cancelled runs without writing final weights' do
      model.update!(serving_status: 'training')
      training_run.request_cancellation!
      progress_broadcaster = instance_double(Ml::ProgressBroadcaster, running: nil, cancelled: nil)

      result = described_class.new(training_run:, candles:, progress_broadcaster:).call

      expect(result.status).to eq(:cancelled)
      expect(training_run.reload.status).to eq('cancelled')
      expect(training_run.weight_checksum).to be_nil
      expect(training_run.weight_blob).to be_nil
      expect(model.reload.serving_status).to eq('draft')
      expect(progress_broadcaster).not_to have_received(:running)
      expect(progress_broadcaster).to have_received(:cancelled).with(training_run:)
    end

    it 'falls back to terminal status when persisted error metadata has nil fields' do
      training_run.update!(status: 'failed', error_metadata: { code: nil, message: nil })
      progress_broadcaster = instance_double(Ml::ProgressBroadcaster, cancelled: nil)

      result = described_class.new(training_run:, candles:, progress_broadcaster:).call

      expect(result.status).to eq(:failed)
      expect(result.error.code).to eq(:failed)
      expect(result.error.message).to eq('training run is already failed')
    end

    it 'does not let a stale successful worker overwrite a terminal failed run' do
      adapter = Class.new do
        def initialize(training_run)
          @training_run = training_run
        end

        def train(examples:, hyperparams:, callbacks:, feature_names: nil)
          @training_run.update!(
            status: 'failed',
            cancellation_requested_at: Time.current,
            error_metadata: { code: 'stale_worker', message: 'training run heartbeat is stale' }
          )
          Ml::Adapters::Result::TrainingResult.new(
            status: :succeeded,
            weights_format: MlModelWeightBlob::BASELINE_FORMAT,
            weights_payload: '{"weights":[]}',
            metrics: MlTrainingRun.canonical_metrics,
            fitted_metadata: {},
            diagnostics: {},
            error: nil
          )
        end
      end.new(training_run)
      progress_broadcaster = instance_double(Ml::ProgressBroadcaster, running: nil, failed: nil, succeeded: nil, cancelled: nil)

      result = described_class.new(training_run:, adapter:, candles:, progress_broadcaster:).call

      expect(result.status).to eq(:failed)
      expect(result.error.code).to eq(:stale_worker)
      expect(training_run.reload.status).to eq('failed')
      expect(training_run.weight_checksum).to be_nil
      expect(training_run.weight_blob).to be_nil
      expect(model.reload.latest_successful_training_run).to be_nil
      expect(model.serving_status).not_to eq('trained')
      expect(progress_broadcaster).not_to have_received(:succeeded)
      expect(progress_broadcaster).not_to have_received(:cancelled)
    end

    it 'observes cancellation after adapter success before writing weights' do
      model.update!(serving_status: 'training')
      adapter = Class.new do
        def initialize(training_run)
          @training_run = training_run
        end

        def train(examples:, hyperparams:, callbacks:, feature_names: nil)
          @training_run.request_cancellation!
          Ml::Adapters::Result::TrainingResult.new(
            status: :succeeded,
            weights_format: MlModelWeightBlob::BASELINE_FORMAT,
            weights_payload: '{"weights":[]}',
            metrics: MlTrainingRun.canonical_metrics,
            fitted_metadata: {},
            diagnostics: {},
            error: nil
          )
        end
      end.new(training_run)
      progress_broadcaster = instance_double(Ml::ProgressBroadcaster, running: nil, cancelled: nil)

      result = described_class.new(training_run:, adapter:, candles:, progress_broadcaster:).call

      expect(result.status).to eq(:cancelled)
      expect(training_run.reload.status).to eq('cancelled')
      expect(training_run.weight_checksum).to be_nil
      expect(training_run.weight_blob).to be_nil
      expect(model.reload.serving_status).to eq('draft')
    end

    it 'fails stale resolved feature snapshots instead of rereresolving dataset feature specs' do
      training_run.resolved_feature_spec.first['definition_checksum'] = 'old-definition-checksum'
      training_run.save!
      progress_broadcaster = instance_double(Ml::ProgressBroadcaster, running: nil, failed: nil)

      result = described_class.new(training_run:, candles:, progress_broadcaster:).call

      expect(result.status).to eq(:failed)
      expect(result.error.code).to eq(:feature_definition_stale)
      expect(training_run.reload.status).to eq('failed')
      expect(training_run.error_metadata).to include('code' => 'feature_definition_stale')
      expect(training_run.weight_blob).to be_nil
      expect(progress_broadcaster).to have_received(:failed).with(training_run:)
    end

    it 'throttles persisted cancellation reloads but observes cancellation after the interval' do
      adapter = Class.new do
        def initialize(training_run)
          @training_run = training_run
        end

        def train(examples:, hyperparams:, callbacks:, feature_names: nil)
          @training_run.request_cancellation!
          callbacks.check_cancelled!
          callbacks.check_cancelled!
          raise 'expected cancellation'
        end
      end.new(training_run)
      ticks = [ 0.0, 0.0, 0.1, 0.3, 0.4 ]
      clock = -> { ticks.shift || 0.5 }

      result = described_class.new(training_run:, adapter:, candles:, clock:).call

      expect(result.status).to eq(:cancelled)
      expect(training_run.reload.status).to eq('cancelled')
    end

    it 'touches heartbeat from cancellation checks even without progress reports' do
      training_run.update!(status: 'running', heartbeat_at: 1.hour.ago)
      progress_broadcaster = instance_double(Ml::ProgressBroadcaster, progress: nil)
      context = described_class::CallbackContext.new(
        training_run:,
        delegate: nil,
        clock: -> { 1.0 },
        progress_broadcaster:
      )

      expect { context.check_cancelled! }
        .to change { training_run.reload.heartbeat_at }
    end
  end
end
