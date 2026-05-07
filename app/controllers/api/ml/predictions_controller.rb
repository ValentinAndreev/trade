# frozen_string_literal: true

require 'set'

module Api
  module Ml
    class PredictionsController < Api::ApplicationController
      ColumnSpec = Data.define(:column_id, :model_key, :model_output)

      MODEL_KEY_FORMAT = /\A[a-z0-9][a-z0-9_-]*\z/
      # Process-local guard for duplicate grid requests within one Rails process.
      # It is not a distributed lock across Puma workers.
      REQUEST_GUARD_MUTEX = Mutex.new
      ACTIVE_REQUEST_KEYS = Set.new

      class RequestError < StandardError
        attr_reader :code, :status, :details

        def initialize(code, message, status:, details: {})
          @code = code
          @status = status
          @details = details
          super(message)
        end
      end

      class << self
        def reserve_request_guard!(key)
          REQUEST_GUARD_MUTEX.synchronize do
            return false if ACTIVE_REQUEST_KEYS.include?(key)

            ACTIVE_REQUEST_KEYS.add(key)
            true
          end
        end

        def release_request_guard!(key)
          REQUEST_GUARD_MUTEX.synchronize { ACTIVE_REQUEST_KEYS.delete(key) }
        end
      end

      def limits
        render json: { max_prediction_rows: ::Ml::PredictionRepository::MAX_CELLS }
      end

      def create
        guard_key = request_guard_key
        reserved = self.class.reserve_request_guard!(guard_key)
        unless reserved
          render_error(
            :grid_prediction_request_in_progress,
            'another ML grid prediction request is already running for this session',
            status: :too_many_requests,
            details: { retryable: true }
          )
          return
        end

        render_grid_predictions
      rescue RequestError => e
        render_error(e.code, e.message, status: e.status, details: e.details)
      ensure
        self.class.release_request_guard!(guard_key) if reserved
      end

      private

      def render_grid_predictions
        symbol = required_identity!(:symbol).upcase
        timeframe = required_identity!(:timeframe).downcase
        exchange = optional_identity(:exchange, default: Candle::FindQuery::DEFAULT_EXCHANGE).downcase
        start_time = parse_time_boundary!(:start_time)
        end_time = parse_time_boundary!(:end_time)
        timeframe_duration = timeframe_duration!(timeframe)
        columns, column_errors = column_specs
        grouped_outputs = columns.group_by(&:model_key).transform_values { |group| group.map(&:model_output).uniq }
        preflight_candle_count = candle_count(start_time:, end_time:, timeframe_duration:)
        cap_error = prediction_cap_error(preflight_candle_count:, grouped_outputs:)
        raise cap_error if cap_error

        candles = Candle::FindQuery.new(symbol:, exchange:, timeframe:, start_time:, end_time:, limit: nil, preserve_decimals: true).call
        results_by_model = inference_results(
          symbol:,
          exchange:,
          timeframe:,
          start_time:,
          end_time:,
          candles:,
          grouped_outputs:
        )

        render json: response_payload(
          exchange:,
          symbol:,
          timeframe:,
          start_time:,
          end_time:,
          candles:,
          columns:,
          column_errors:,
          grouped_outputs:,
          preflight_candle_count:,
          results_by_model:
        )
      end

      def required_identity!(key)
        value = params.require(key).to_s.strip
        raise RequestError.new(:"missing_#{key}", "#{key} is required", status: :bad_request) if value.blank?

        value
      end

      def optional_identity(key, default:)
        value = params[key].presence || default
        value.to_s.strip
      end

      def parse_time_boundary!(key)
        Time.iso8601(params.require(key).to_s).utc
      rescue ArgumentError
        raise RequestError.new(
          :invalid_time_boundary,
          "invalid prediction time boundary: #{key}",
          status: :unprocessable_entity,
          details: { field: key.to_s, value: params[key].to_s }
        )
      end

      def timeframe_duration!(timeframe)
        TimeframeParser.duration_seconds(timeframe)
      rescue ArgumentError => e
        raise RequestError.new(:invalid_timeframe, e.message, status: :unprocessable_entity, details: { timeframe: })
      end

      def column_specs
        raw_columns = params.require(:columns)
        unless raw_columns.is_a?(Array)
          raise RequestError.new(:invalid_columns, 'columns must be an array', status: :bad_request)
        end

        seen_column_ids = Set.new
        raw_columns.each_with_index.with_object([ [], {} ]) do |(raw_column, index), (columns, errors)|
          payload = column_payload!(raw_column, index:)
          column_id = canonical_column_id!(payload)
          if seen_column_ids.include?(column_id)
            raise RequestError.new(:duplicate_column_id, 'ML prediction column_id must be unique', status: :bad_request, details: { column_id: })
          end

          seen_column_ids.add(column_id)
          column = ColumnSpec.new(
            column_id:,
            model_key: payload['model_key'].to_s.strip.downcase,
            model_output: payload['model_output'].to_s.strip
          )
          error = column_error(column)
          error ? errors[column_id] = error : columns << column
        end
      end

      def column_payload!(raw_column, index:)
        case raw_column
        when ActionController::Parameters
          raw_column.to_unsafe_h.stringify_keys
        when Hash
          raw_column.stringify_keys
        else
          raise RequestError.new(:invalid_columns, 'columns entries must be objects', status: :bad_request, details: { index: })
        end
      end

      def canonical_column_id!(payload)
        column_id = payload.fetch('column_id').to_s.strip
        if column_id.blank?
          raise RequestError.new(:missing_column_id, 'ML prediction column_id is required', status: :bad_request)
        end

        column_id
      rescue KeyError
        raise RequestError.new(:missing_column_id, 'ML prediction column_id is required', status: :bad_request)
      end

      def column_error(column)
        if column.model_key.blank?
          return error_payload(:missing_model_key, 'ML prediction column requires model_key')
        end
        unless MODEL_KEY_FORMAT.match?(column.model_key)
          return error_payload(:invalid_model_key, 'ML prediction model_key is invalid', model_key: column.model_key)
        end
        if column.model_output.blank?
          return error_payload(:missing_model_output, 'ML prediction column requires model_output')
        end
        unless MlPrediction::OUTPUTS.include?(column.model_output)
          return error_payload(:unsupported_output, 'unsupported prediction output requested', output: column.model_output, allowed: MlPrediction::OUTPUTS)
        end

        nil
      end

      def candle_count(start_time:, end_time:, timeframe_duration:)
        return 0 if end_time < start_time

        ((end_time.to_i - start_time.to_i) / timeframe_duration).floor + 1
      end

      def prediction_cap_error(preflight_candle_count:, grouped_outputs:)
        requested_prediction_rows = preflight_candle_count * grouped_outputs.length
        return if requested_prediction_rows <= ::Ml::PredictionRepository::MAX_CELLS

        RequestError.new(
          :prediction_cell_cap_exceeded,
          "prediction request exceeds #{::Ml::PredictionRepository::MAX_CELLS} prediction rows",
          status: :unprocessable_entity,
          details: {
            requested_prediction_rows:,
            max_prediction_rows: ::Ml::PredictionRepository::MAX_CELLS,
            candle_count: preflight_candle_count,
            distinct_requested_models: grouped_outputs.length,
            requested_outputs_by_model: grouped_outputs,
            hint: 'reduce the time range or number of distinct models'
          }
        )
      end

      def inference_results(symbol:, exchange:, timeframe:, start_time:, end_time:, candles:, grouped_outputs:)
        warmup_candle_cache = {}
        grouped_outputs.each_with_object({}) do |(model_key, outputs), results|
          results[model_key] = ::Ml::InferenceService.new(
            model_key:,
            symbol:,
            exchange:,
            timeframe:,
            start_time:,
            end_time:,
            outputs:,
            candles:,
            warmup_candle_cache:
          ).call
        end
      end

      def response_payload(exchange:, symbol:, timeframe:, start_time:, end_time:, candles:, columns:, column_errors:, grouped_outputs:, preflight_candle_count:, results_by_model:)
        {
          exchange:,
          symbol:,
          timeframe:,
          start_time: start_time.iso8601,
          end_time: end_time.iso8601,
          values: values_by_column(candles:, columns:, column_errors:, results_by_model:),
          errors: errors_by_column(columns:, column_errors:, results_by_model:),
          diagnostics: diagnostics(candles:, columns:, grouped_outputs:, preflight_candle_count:, results_by_model:)
        }
      end

      def values_by_column(candles:, columns:, column_errors:, results_by_model:)
        nil_values = candles.map { |candle| candle.fetch(:time).to_i.to_s }.index_with(nil)
        values = column_errors.keys.index_with { nil_values }
        columns.each do |column|
          result = results_by_model.fetch(column.model_key)
          values[column.column_id] = result.success? ? projected_values(result, column.model_output) : nil_values
        end
        values
      end

      def projected_values(result, model_output)
        result.series.each_with_object({}) do |point, values|
          values[point.fetch(:time).to_s] = point.fetch(:values).fetch(model_output)
        end
      end

      def errors_by_column(columns:, column_errors:, results_by_model:)
        errors = column_errors.deep_dup
        columns.each do |column|
          result = results_by_model.fetch(column.model_key)
          errors[column.column_id] = result.error.to_h unless result.success?
        end
        errors
      end

      def diagnostics(candles:, columns:, grouped_outputs:, preflight_candle_count:, results_by_model:)
        {
          candle_count: candles.length,
          preflight_candle_count:,
          requested_prediction_rows: preflight_candle_count * grouped_outputs.length,
          max_prediction_rows: ::Ml::PredictionRepository::MAX_CELLS,
          distinct_requested_models: grouped_outputs.length,
          requested_outputs_by_model: grouped_outputs,
          model_diagnostics: results_by_model.transform_values(&:diagnostics),
          source_window_mismatches_by_column: source_window_mismatches_by_column(columns:, results_by_model:)
        }
      end

      def source_window_mismatches_by_column(columns:, results_by_model:)
        columns.each_with_object({}) do |column, mismatches_by_column|
          result = results_by_model.fetch(column.model_key)
          next unless result.success?

          mismatches = result.diagnostics.fetch('source_window_mismatches', {})
          mismatches_by_column[column.column_id] = mismatches if mismatches.present?
        end
      end

      def render_error(code, message, status:, details: {})
        render json: { error: error_payload(code, message, **details) }, status:
      end

      def error_payload(code, message, **details)
        {
          code: code.to_s,
          message:,
          details:
        }
      end

      def request_guard_key = "ml-grid-predictions:user:#{current_user.id}"
    end
  end
end
