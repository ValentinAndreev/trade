# frozen_string_literal: true

module Ml
  class InferenceService
    Error = Data.define(:code, :message, :details) do
      def to_h
        {
          code: code.to_s,
          message:,
          details: details || {}
        }
      end
    end

    Result = Data.define(:status, :model, :snapshot, :series, :diagnostics, :error) do
      def success? = status == :succeeded
    end

    Snapshot = Data.define(
      :model,
      :training_run,
      :training_run_id,
      :weight_checksum,
      :weights_format,
      :weights_payload,
      :resolved_feature_spec,
      :fitted_metadata
    )

    def initialize(model_key:, symbol:, timeframe:, exchange: 'bitfinex', start_time: nil, end_time: nil,
      outputs: [ 'probability' ], candles: nil, batch_size: PredictionRepository::DEFAULT_BATCH_SIZE,
      adapter: Ml::Adapters::BaselineDirectionClassifier.new, cancel_check: nil)
      @model_key = model_key.to_s
      @symbol = symbol.to_s
      @timeframe = timeframe.to_s
      @exchange = exchange.to_s
      @start_time = start_time
      @end_time = end_time
      @outputs = outputs
      @candles = candles
      @batch_size = batch_size.to_i
      @adapter = adapter
      @cancel_check = cancel_check
      @started_at = Process.clock_gettime(Process::CLOCK_MONOTONIC)
    end

    def call
      normalized_outputs = normalize_outputs
      return failure(:unsupported_output, 'unsupported prediction output requested', details: normalized_outputs) if normalized_outputs.is_a?(Hash)

      source_candles = load_candles
      cap_error = prediction_cell_cap_error(normalized_outputs, source_candles.length)
      return failure(cap_error.fetch(:code), cap_error.fetch(:message), details: cap_error.fetch(:details)) if cap_error

      snapshot = capture_snapshot
      return failure(snapshot.code, snapshot.message, details: snapshot.details) if snapshot.is_a?(Error)

      check_cancelled!
      dataset = build_dataset(snapshot, source_candles)
      repository = PredictionRepository.new(model: snapshot.model, exchange:, symbol:, timeframe:)
      current_by_time = repository.fetch_current(rows: dataset.rows, weight_checksum: snapshot.weight_checksum)
      reused_rows = current_by_time.length
      missing_rows = repository.missing_complete_rows(rows: dataset.rows, current_by_time:)
      computed_rows = compute_missing_predictions(
        repository:,
        snapshot:,
        missing_rows:,
        current_by_time:
      )

      success_result(
        model: snapshot.model,
        snapshot:,
        series: series_for(dataset.rows, current_by_time, normalized_outputs, repository),
        diagnostics: diagnostics_for(
          dataset:,
          outputs: normalized_outputs,
          reused_rows:,
          computed_rows:
        )
      )
    rescue Ml::Cancelled
      failure(:cancelled, 'inference was cancelled', status: :cancelled)
    rescue InferenceFailure => e
      failure(e.error.code, e.error.message, details: e.error.details || {})
    rescue Ml::FeatureWindow::Error => e
      failure(e.code, e.message, details: e.details)
    rescue StandardError => e
      failure(:inference_error, e.message)
    end

    private

    attr_reader :model_key, :symbol, :timeframe, :exchange, :start_time, :end_time,
      :outputs, :candles, :batch_size, :adapter, :cancel_check

    def normalize_outputs
      normalized = Array(outputs.presence || [ 'probability' ]).map(&:to_s).uniq
      unsupported = normalized - MlPrediction::OUTPUTS
      return normalized if unsupported.empty?

      {
        unsupported:,
        allowed: MlPrediction::OUTPUTS
      }
    end

    def load_candles
      check_cancelled!
      source = candles || Candle::FindQuery.new(
        symbol:,
        exchange:,
        timeframe:,
        start_time:,
        end_time:,
        limit: nil
      ).call
      source.sort_by { |candle| candle.fetch(:time) }
    end

    def prediction_cell_cap_error(normalized_outputs, candle_count)
      requested_cells = candle_count * normalized_outputs.length
      return if requested_cells <= PredictionRepository::MAX_CELLS

      {
        code: :prediction_cell_cap_exceeded,
        message: "prediction request exceeds #{PredictionRepository::MAX_CELLS} cells",
        details: {
          requested_cells:,
          max_cells: PredictionRepository::MAX_CELLS,
          candle_count:,
          outputs: normalized_outputs,
          hint: 'reduce the time range or requested outputs'
        }
      }
    end

    def capture_snapshot
      model = MlModel.includes(latest_successful_training_run: :weight_blob).find_by(key: model_key)
      return error(:unknown_model, "unknown ML model: #{model_key}") unless model
      return error(:model_not_trained, "ML model is not trained: #{model_key}") unless model.trained?

      training_run = model.latest_successful_training_run
      weight_blob = training_run&.weight_blob
      return error(:missing_weights, "ML model weights are not available: #{model_key}") unless training_run && weight_blob
      compatibility_error = snapshot_compatibility_error(training_run)
      return compatibility_error if compatibility_error

      weight_checksum = model.serving_weight_checksum.presence || training_run.weight_checksum
      unless weight_checksum == training_run.weight_checksum && weight_checksum == weight_blob.checksum
        return error(
          :weight_checksum_mismatch,
          "ML model serving checksum does not match stored weights: #{model_key}",
          model_checksum: model.serving_weight_checksum,
          training_run_checksum: training_run.weight_checksum,
          blob_checksum: weight_blob.checksum
        )
      end

      Snapshot.new(
        model:,
        training_run:,
        training_run_id: training_run.id,
        weight_checksum:,
        weights_format: weight_blob.weights_format,
        weights_payload: weight_blob.weights_payload,
        resolved_feature_spec: training_run.resolved_feature_spec,
        fitted_metadata: training_run.fitted_metadata
      )
    end

    def snapshot_compatibility_error(training_run)
      dataset_spec = training_run.dataset_spec.to_h.stringify_keys
      expected = {
        'symbol' => symbol,
        'timeframe' => timeframe,
        'exchange' => exchange
      }
      mismatches = expected.filter_map do |key, expected_value|
        actual_value = dataset_spec[key].presence
        next unless actual_value && expected_value.present? && actual_value.to_s != expected_value.to_s

        { field: key, expected: expected_value, actual: actual_value }
      end
      return if mismatches.empty?

      error(
        :model_dataset_incompatible,
        "ML model is incompatible with requested dataset: #{model_key}",
        mismatches:
      )
    end

    def build_dataset(snapshot, source_candles)
      Ml::DatasetBuilder.new(
        symbol:,
        exchange:,
        timeframe:,
        dataset_spec: snapshot.training_run.dataset_spec,
        feature_spec: snapshot.resolved_feature_spec,
        hyperparams: snapshot.training_run.hyperparams,
        candles: source_candles,
        cancel_check:
      ).build_inference
    end

    def compute_missing_predictions(repository:, snapshot:, missing_rows:, current_by_time:)
      computed_rows = 0
      predictor = Ml::Predictor.new(
        weights_format: snapshot.weights_format,
        weights_payload: snapshot.weights_payload,
        adapter:
      )

      missing_rows.each_slice(effective_batch_size) do |batch|
        check_cancelled!
        prediction_batch = predictor.predict(features: batch.map { |row| row.fetch(:features) })
        unless prediction_batch.success?
          raise InferenceFailure, prediction_batch.error || error(:adapter_error, 'prediction adapter failed')
        end

        repository.upsert_predictions(
          training_run: snapshot.training_run,
          rows: batch,
          predictions: prediction_batch.predictions,
          weight_checksum: snapshot.weight_checksum
        )
        current_by_time.merge!(repository.fetch_current(rows: batch, weight_checksum: snapshot.weight_checksum))
        computed_rows += batch.length
      end

      computed_rows
    rescue ActiveRecord::ActiveRecordError => e
      raise InferenceFailure, error(:prediction_persistence_failed, e.message)
    end

    def effective_batch_size = batch_size.positive? ? batch_size : PredictionRepository::DEFAULT_BATCH_SIZE

    def series_for(rows, current_by_time, normalized_outputs, repository)
      rows.map do |row|
        prediction = current_by_time[row.fetch(:time).to_i]
        {
          time: row.fetch(:time),
          complete: row.fetch(:complete),
          values: normalized_outputs.index_with { |output| repository.value_for(prediction, output) }
        }
      end
    end

    def diagnostics_for(dataset:, outputs:, reused_rows:, computed_rows:)
      dataset.diagnostics.merge(
        'outputs' => outputs,
        'requested_cells' => dataset.rows.length * outputs.length,
        'max_cells' => PredictionRepository::MAX_CELLS,
        'reused_prediction_rows' => reused_rows,
        'computed_prediction_rows' => computed_rows,
        'duration_ms' => duration_ms
      )
    end

    def success_result(model:, snapshot:, series:, diagnostics:)
      Result.new(status: :succeeded, model:, snapshot:, series:, diagnostics:, error: nil)
    end

    def failure(code, message, status: :failed, details: {})
      Result.new(
        status:,
        model: nil,
        snapshot: nil,
        series: [],
        diagnostics: {
          'duration_ms' => duration_ms,
          'status' => status.to_s,
          'error_code' => code.to_s
        },
        error: error(code, message, **details)
      )
    end

    def error(code, message, **details)
      Error.new(code:, message:, details:)
    end

    def duration_ms
      ((Process.clock_gettime(Process::CLOCK_MONOTONIC) - @started_at) * 1000).round
    end

    def check_cancelled!
      if cancel_check.respond_to?(:check_cancelled!)
        cancel_check.check_cancelled!
      elsif cancel_check.respond_to?(:call) && cancel_check.call
        raise Ml::Cancelled
      end
    end

    class InferenceFailure < StandardError
      attr_reader :error

      def initialize(error)
        @error = error
        super(error.message)
      end
    end
  end
end
