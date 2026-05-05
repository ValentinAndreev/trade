# frozen_string_literal: true

module Ml
  class TrainingRunner
    Result = Data.define(:status, :training_run, :adapter_result, :error) do
      def success? = status == :succeeded
    end

    DEFAULT_HYPERPARAMS = Ml::DatasetBuilder::DEFAULT_HYPERPARAMS
      .merge(Ml::Adapters::BaselineDirectionClassifier::DEFAULT_HYPERPARAMS.deep_stringify_keys)
      .freeze

    def initialize(
      training_run:,
      adapter: Ml::Adapters::BaselineDirectionClassifier.new,
      callbacks: nil,
      candles: nil,
      clock: -> { Process.clock_gettime(Process::CLOCK_MONOTONIC) },
      progress_broadcaster: Ml::ProgressBroadcaster.new(training_run:)
    )
      @training_run = training_run
      @adapter = adapter
      @callbacks = callbacks
      @candles = candles
      @clock = clock
      @progress_broadcaster = progress_broadcaster
      @started_at = nil
    end

    def call
      @started_at = monotonic_time
      mark_running!
      dataset = build_dataset
      adapter_result = adapter.train(
        examples: dataset.examples,
        hyperparams: effective_hyperparams,
        callbacks: callback_context
      )

      return fail_run!(adapter_result.error || adapter_error(:adapter_failed, 'training adapter failed'), adapter_result:) unless adapter_result.success?

      succeed_run!(dataset, adapter_result)
    rescue Ml::Cancelled
      cancel_run!
    rescue StandardError => e
      fail_run!(adapter_error(:training_runner_error, e.message))
    end

    private

    attr_reader :training_run, :adapter, :callbacks, :candles, :progress_broadcaster

    def mark_running!
      training_run.update!(
        status: 'running',
        started_at: Time.current,
        heartbeat_at: Time.current,
        error_metadata: {},
        weight_checksum: nil
      )
      progress_broadcaster.running(training_run:)
    end

    def build_dataset
      dataset = dataset_spec
      Ml::DatasetBuilder.new(
        symbol: dataset.fetch('symbol'),
        exchange: dataset.fetch('exchange', 'bitfinex'),
        timeframe: dataset.fetch('timeframe'),
        start_time: dataset['start_time'],
        end_time: dataset['end_time'],
        dataset_spec: dataset,
        feature_spec: dataset['feature_spec'] || training_run.resolved_feature_spec.presence,
        hyperparams: effective_hyperparams,
        candles:,
        cancel_check: callback_context
      ).build_training
    end

    def succeed_run!(dataset, adapter_result)
      weights_payload = adapter_result.weights_payload.to_s
      weights_format = adapter_result.weights_format.to_s
      now = Time.current
      training_run.assign_attributes(
        status: 'succeeded',
        dataset_spec: dataset.dataset_spec,
        resolved_feature_spec: dataset.resolved_feature_spec,
        hyperparams: effective_hyperparams,
        seed: effective_hyperparams.fetch('seed').to_i,
        metrics: adapter_result.metrics,
        fitted_metadata: dataset.fitted_metadata.merge(adapter_result.fitted_metadata.to_h),
        error_metadata: {},
        finished_at: now,
        duration_ms: duration_ms,
        heartbeat_at: now
      )
      checksum = MlModelWeightBlob.checksum_for(
        training_run:,
        weights_format:,
        weights_payload:
      )
      training_run.weight_checksum = checksum

      ActiveRecord::Base.transaction do
        training_run.save!
        MlModelWeightBlob.create!(
          ml_training_run: training_run,
          weights_format:,
          weights_payload:,
          checksum:
        )
        training_run.ml_model.update!(
          serving_status: 'trained',
          latest_successful_training_run: training_run,
          metric_summary: adapter_result.metrics,
          serving_weight_checksum: checksum
        )
      end

      progress_broadcaster.succeeded(training_run:)
      Result.new(status: :succeeded, training_run:, adapter_result:, error: nil)
    end

    def fail_run!(error, adapter_result: nil)
      training_run.update!(
        status: 'failed',
        error_metadata: error.to_h,
        finished_at: Time.current,
        duration_ms: duration_ms,
        weight_checksum: nil
      )
      training_run.ml_model.update!(
        serving_status: training_run.ml_model.trained? ? training_run.ml_model.serving_status : 'failed',
        latest_failed_training_run: training_run
      )
      progress_broadcaster.failed(training_run:)
      Result.new(status: :failed, training_run:, adapter_result:, error:)
    end

    def cancel_run!
      training_run.update!(
        status: 'cancelled',
        finished_at: Time.current,
        duration_ms: duration_ms,
        weight_checksum: nil,
        error_metadata: { code: 'cancelled', message: 'training was cancelled' }
      )
      progress_broadcaster.cancelled(training_run:)
      Result.new(status: :cancelled, training_run:, adapter_result: nil, error: adapter_error(:cancelled, 'training was cancelled'))
    end

    def dataset_spec = training_run.dataset_spec.to_h.deep_stringify_keys

    def effective_hyperparams
      @effective_hyperparams ||= DEFAULT_HYPERPARAMS
        .merge(training_run.hyperparams.to_h.deep_stringify_keys)
        .merge('seed' => training_run.hyperparams.to_h.fetch('seed', training_run.seed).to_i)
    end

    def callback_context
      @callback_context ||= CallbackContext.new(training_run:, delegate: callbacks, clock:, progress_broadcaster:)
    end

    def adapter_error(code, message, details = {})
      Ml::Adapters::Result::Error.new(code:, message:, details:)
    end

    def duration_ms
      ((monotonic_time - @started_at) * 1000).round
    end

    def monotonic_time = clock.call

    attr_reader :clock

    class CallbackContext
      RELOAD_INTERVAL_SECONDS = 0.2

      def initialize(training_run:, delegate:, clock:, progress_broadcaster:)
        @training_run = training_run
        @delegate = delegate
        @clock = clock
        @progress_broadcaster = progress_broadcaster
        @last_reload_at = nil
      end

      def check_cancelled!
        delegate.check_cancelled! if delegate.respond_to?(:check_cancelled!)
        reload_if_due
        raise Ml::Cancelled if training_run.cancellation_requested?
      end

      def report_progress(**payload)
        training_run.update!(heartbeat_at: Time.current)
        progress_broadcaster.progress(training_run:, **payload)
        delegate.report_progress(**payload) if delegate.respond_to?(:report_progress)
      end

      private

      attr_reader :training_run, :delegate, :clock, :progress_broadcaster

      def reload_if_due
        now = clock.call
        return if @last_reload_at && (now - @last_reload_at) < RELOAD_INTERVAL_SECONDS

        training_run.reload
        @last_reload_at = now
      end
    end
  end
end
