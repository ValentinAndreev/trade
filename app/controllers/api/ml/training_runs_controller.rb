# frozen_string_literal: true

module Api
  module Ml
    class TrainingRunsController < Api::ApplicationController
      MAX_LIMIT = 50

      def index
        runs = ::MlTrainingRun.recent.includes(:ml_model).limit(requested_limit)
        runs = runs.joins(:ml_model).where(ml_models: { key: params[:model_key].to_s }) if params[:model_key].present?

        render json: runs.map { |training_run| serialize_training_run(training_run) }
      end

      def create
        result = lifecycle.create(training_run_payload)
        render_lifecycle_result(result)
      end

      def cancel
        result = lifecycle.cancel(params.require(:id))
        render_lifecycle_result(result)
      end

      private

      def lifecycle = ::Ml::TrainingRunLifecycle.new

      def requested_limit
        value = params[:limit].to_i
        value = MAX_LIMIT if value <= 0
        [ value, MAX_LIMIT ].min
      end

      def training_run_payload
        params.permit(
          :model_key,
          :display_name,
          :architecture,
          :prediction_target,
          dataset_spec: {},
          hyperparams: {},
          feature_spec: [ :type, :output, :name, { params: {} } ]
        ).to_h.deep_symbolize_keys
      end

      def render_lifecycle_result(result)
        payload = result.success? ? serialize_training_run(result.training_run) : { error: result.error.to_h }
        render json: payload, status: result.status
      end

      def serialize_training_run(training_run)
        {
          id: training_run.id,
          model: serialize_model_summary(training_run.ml_model),
          status: training_run.status,
          dataset_spec: training_run.dataset_spec,
          resolved_feature_spec: training_run.resolved_feature_spec,
          hyperparams: training_run.hyperparams,
          seed: training_run.seed,
          metrics: training_run.metrics,
          error_metadata: training_run.error_metadata,
          fitted_metadata: training_run.fitted_metadata,
          weight_checksum: training_run.weight_checksum,
          cancellation_requested_at: training_run.cancellation_requested_at&.iso8601,
          heartbeat_at: training_run.heartbeat_at&.iso8601,
          started_at: training_run.started_at&.iso8601,
          finished_at: training_run.finished_at&.iso8601,
          duration_ms: training_run.duration_ms,
          created_at: training_run.created_at.iso8601,
          updated_at: training_run.updated_at.iso8601
        }
      end

      def serialize_model_summary(model)
        {
          id: model.id,
          key: model.key,
          display_name: model.display_name,
          architecture: model.architecture,
          prediction_target: model.prediction_target,
          serving_status: model.serving_status,
          serving_weight_checksum: model.serving_weight_checksum
        }
      end
    end
  end
end
