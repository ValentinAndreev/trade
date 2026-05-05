# frozen_string_literal: true

module Ml
  class TrainingRunLifecycle
    DEFAULT_ARCHITECTURE = 'baseline_direction_classifier'
    DEFAULT_PREDICTION_TARGET = 'direction_classification'

    Error = Data.define(:code, :message, :details) do
      def to_h
        {
          code: code.to_s,
          message:,
          details: details || {}
        }
      end
    end

    Result = Data.define(:status, :model, :training_run, :error) do
      def success? = status == :created || status == :ok
    end

    class ActiveRunConflict < StandardError; end

    STALE_HEARTBEAT_AFTER = 30.minutes

    class_attribute :default_enqueuer, default: ->(training_run) { MlTrainingJob.perform_later(training_run.id) }

    def initialize(enqueuer: self.class.default_enqueuer)
      @enqueuer = enqueuer
    end

    def create(raw_params)
      payload = raw_params.to_h.deep_stringify_keys
      model_key = payload.fetch('model_key', '').to_s.strip
      return error_result(:unprocessable_entity, :model_key_required, 'model_key is required') if model_key.blank?
      dataset_error = validate_dataset_spec(payload.fetch('dataset_spec', {}))
      return dataset_error if dataset_error

      resolved = resolved_feature_window(payload)
      dataset_spec = resolved_dataset_spec(payload, resolved)
      hyperparams = resolved_hyperparams(payload)
      model = nil
      training_run = nil
      stale_training_run = nil

      ActiveRecord::Base.transaction do
        model = find_or_build_model(model_key, payload)
        stale_training_run = reconcile_stale_active_run!(model) if model.persisted?
        raise ActiveRunConflict if model.persisted? && model.training_runs.active.exists?

        model.serving_status = 'training' unless model.trained?
        model.save!

        training_run = model.training_runs.create!(
          status: 'queued',
          dataset_spec:,
          resolved_feature_spec: resolved.resolved_feature_spec,
          hyperparams:,
          seed: hyperparams.fetch('seed', 0).to_i,
          metrics: MlTrainingRun.canonical_metrics,
          error_metadata: {},
          fitted_metadata: {}
        )
        enqueuer.call(training_run)
      end

      broadcast_stale_failure(stale_training_run)
      Ml::ProgressBroadcaster.new(training_run:).queued(training_run:)
      Result.new(status: :created, model:, training_run:, error: nil)
    rescue Ml::FeatureWindow::Error => e
      error_result(:unprocessable_entity, e.code, e.message, details: e.details)
    rescue ActiveRunConflict
      error_result(:conflict, :active_training_run_exists, 'model already has an active training run')
    rescue ActiveRecord::RecordNotUnique
      error_result(:conflict, :active_training_run_exists, 'model already has an active training run')
    rescue ActiveRecord::RecordInvalid => e
      error_result(:unprocessable_entity, :validation_failed, e.record.errors.full_messages.to_sentence)
    rescue StandardError => e
      error_result(:unprocessable_entity, :enqueue_failed, e.message)
    end

    def cancel(training_run_id)
      training_run = MlTrainingRun.find(training_run_id)
      unless training_run.active?
        return Result.new(
          status: :conflict,
          model: training_run.ml_model,
          training_run:,
          error: Error.new(code: :not_active, message: 'training run is not queued or running', details: {})
        )
      end

      training_run.request_cancellation!
      Result.new(status: :ok, model: training_run.ml_model, training_run:, error: nil)
    end

    private

    attr_reader :enqueuer

    def validate_dataset_spec(raw_dataset_spec)
      dataset_spec = raw_dataset_spec.to_h.deep_stringify_keys
      missing = %w[symbol timeframe].reject { |key| dataset_spec[key].present? }
      return if missing.empty?

      error_result(
        :unprocessable_entity,
        :dataset_spec_invalid,
        "dataset_spec requires: #{missing.join(', ')}",
        details: { missing: }
      )
    end

    def reconcile_stale_active_run!(model, now: Time.current)
      stale_before = now - STALE_HEARTBEAT_AFTER
      stale_run = model.training_runs
        .where(status: 'running')
        .where('heartbeat_at IS NULL OR heartbeat_at < ?', stale_before)
        .order(:created_at)
        .first
      return unless stale_run

      stale_run.update!(
        status: 'failed',
        finished_at: now,
        error_metadata: {
          code: 'stale_worker',
          message: 'training run heartbeat is stale',
          stale_after_seconds: STALE_HEARTBEAT_AFTER.to_i
        }
      )
      model.update!(
        latest_failed_training_run: stale_run,
        serving_status: model.trained? ? model.serving_status : 'failed'
      )
      stale_run
    end

    def find_or_build_model(model_key, payload)
      model = MlModel.find_or_initialize_by(key: model_key)
      return model if model.persisted?

      model.display_name = payload['display_name'].presence || model_key.tr('_-', ' ').titleize
      model.architecture = payload['architecture'].presence || DEFAULT_ARCHITECTURE
      model.prediction_target = payload['prediction_target'].presence || DEFAULT_PREDICTION_TARGET
      model.serving_status = 'draft'
      model.metric_summary = MlModel.canonical_metric_summary
      model
    end

    def resolved_feature_window(payload)
      feature_spec = payload['feature_spec'] || payload.dig('dataset_spec', 'feature_spec') || Ml::FeatureWindow.default_feature_spec
      Ml::FeatureWindow.new(feature_spec:)
    end

    def resolved_dataset_spec(payload, resolved)
      payload.fetch('dataset_spec', {}).to_h.deep_stringify_keys
        .merge(
          'prediction_target' => payload['prediction_target'].presence || DEFAULT_PREDICTION_TARGET,
          'feature_spec' => resolved.resolved_feature_spec.map { |entry| entry.slice('type', 'params', 'outputs', 'name') }
        )
    end

    def resolved_hyperparams(payload)
      raw = payload.fetch('hyperparams', {}).to_h.deep_stringify_keys
      seed = payload.key?('seed') ? payload['seed'] : raw.fetch('seed', 0)
      raw.merge('seed' => seed.to_i)
    end

    def error_result(status, code, message, model: nil, training_run: nil, details: {})
      Result.new(
        status:,
        model:,
        training_run:,
        error: Error.new(code:, message:, details:)
      )
    end

    def broadcast_stale_failure(training_run)
      return unless training_run

      Ml::ProgressBroadcaster.new(training_run:).failed(training_run:)
    end
  end
end
