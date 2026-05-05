# frozen_string_literal: true

module Api
  module Ml
    class ModelsController < Api::ApplicationController
      MAX_LIMIT = 50

      def index
        models = ::MlModel.by_key
          .includes(:latest_successful_training_run, :latest_failed_training_run)
          .limit(requested_limit)
          .to_a
        active_runs_by_model_id = active_training_runs_by_model_id(models)

        render json: models.map { |model| serialize_model(model, active_training_run: active_runs_by_model_id[model.id]) }
      end

      private

      def requested_limit
        value = params[:limit].to_i
        value = MAX_LIMIT if value <= 0
        [ value, MAX_LIMIT ].min
      end

      def active_training_runs_by_model_id(models)
        model_ids = models.map(&:id)
        return {} if model_ids.empty?

        ::MlTrainingRun.active
          .where(ml_model_id: model_ids)
          .order(created_at: :desc, id: :desc)
          .each_with_object({}) do |training_run, active_by_model_id|
            active_by_model_id[training_run.ml_model_id] ||= training_run
          end
      end

      def serialize_model(model, active_training_run:)
        {
          id: model.id,
          key: model.key,
          display_name: model.display_name,
          architecture: model.architecture,
          prediction_target: model.prediction_target,
          serving_status: model.serving_status,
          metric_summary: model.metric_summary,
          serving_weight_checksum: model.serving_weight_checksum,
          latest_successful_training_run: serialize_run_summary(model.latest_successful_training_run),
          latest_failed_training_run: serialize_run_summary(model.latest_failed_training_run),
          active_training_run: serialize_run_summary(active_training_run)
        }
      end

      def serialize_run_summary(training_run)
        return unless training_run

        {
          id: training_run.id,
          status: training_run.status,
          metrics: training_run.metrics,
          error_metadata: training_run.error_metadata,
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
    end
  end
end
