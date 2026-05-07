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

    def initialize(model_key:, symbol:, timeframe:, exchange: Candle::FindQuery::DEFAULT_EXCHANGE, start_time: nil, end_time: nil,
      outputs: [ 'probability' ], candles: nil, batch_size: PredictionRepository::DEFAULT_BATCH_SIZE,
      adapter: Ml::Adapters::BaselineDirectionClassifier.new, cancel_check: nil, warmup_candle_cache: nil)
      @model_key = model_key.to_s
      @symbol = normalize_symbol(symbol)
      @timeframe = normalize_timeframe(timeframe)
      @exchange = normalize_exchange(exchange)
      @start_time = start_time
      @end_time = end_time
      @outputs = outputs
      @candles = candles
      @batch_size = batch_size.to_i
      @adapter = adapter
      @cancel_check = cancel_check
      @warmup_candle_cache = warmup_candle_cache
      @started_at = Process.clock_gettime(Process::CLOCK_MONOTONIC)
    end

    def call
      normalized_outputs = normalize_outputs
      output_error = unsupported_outputs_error(normalized_outputs)
      return failure(output_error.code, output_error.message, details: output_error.details) if output_error
      timeframe_error = validate_timeframe
      return failure(timeframe_error.code, timeframe_error.message, details: timeframe_error.details) if timeframe_error

      range_error = validate_bounded_range_without_candles
      return failure(range_error.code, range_error.message, details: range_error.details) if range_error

      preflight_candle_count = preflight_requested_candle_count
      if preflight_candle_count
        cap_error = prediction_row_cap_error(normalized_outputs, preflight_candle_count)
        return failure(cap_error.fetch(:code), cap_error.fetch(:message), details: cap_error.fetch(:details)) if cap_error
      end

      snapshot = capture_snapshot

      source_candles = load_candles(snapshot)
      requested_candle_count = requested_candles(source_candles).length
      cap_error = prediction_row_cap_error(normalized_outputs, requested_candle_count)
      return failure(cap_error.fetch(:code), cap_error.fetch(:message), details: cap_error.fetch(:details)) if cap_error

      check_cancelled!
      dataset = build_dataset(snapshot, source_candles)
      requested_rows = rows_in_requested_range(dataset.rows)
      repository = PredictionRepository.new(model: snapshot.model, exchange:, symbol:, timeframe:)
      current_by_time = repository.fetch_current(rows: requested_rows, weight_checksum: snapshot.weight_checksum)
      reused_rows = current_by_time.length
      missing_rows = repository.missing_complete_rows(rows: requested_rows, current_by_time:)
      computed_rows = compute_missing_predictions(
        repository:,
        snapshot:,
        missing_rows:,
        current_by_time:
      )

      success_result(
        model: snapshot.model,
        snapshot:,
        series: series_for(requested_rows, current_by_time, normalized_outputs, repository),
        diagnostics: diagnostics_for(
          dataset:,
          requested_rows:,
          outputs: normalized_outputs,
          reused_rows:,
          computed_rows:,
          source_window_mismatches: repository.source_window_mismatches(rows: requested_rows, weight_checksum: snapshot.weight_checksum)
        )
      )
    rescue Research::Cancelled
      failure(:cancelled, 'inference was cancelled', status: :cancelled)
    rescue InferenceFailure => e
      failure(e.error.code, e.error.message, details: e.error.details || {})
    rescue Ml::DatasetBuilder::Error => e
      failure(e.code, e.message, details: e.details)
    rescue Ml::FeatureWindow::Error => e
      failure(e.code, e.message, details: e.details)
    end

    private

    attr_reader :model_key, :symbol, :timeframe, :exchange, :start_time, :end_time,
      :outputs, :candles, :batch_size, :adapter, :cancel_check, :warmup_candle_cache

    def normalize_outputs
      normalized = Array(outputs.presence || [ 'probability' ]).map(&:to_s).uniq
      normalized.presence || [ 'probability' ]
    end

    def unsupported_outputs_error(normalized)
      unsupported = normalized - MlPrediction::OUTPUTS
      return if unsupported.empty?

      error(
        :unsupported_output,
        'unsupported prediction output requested',
        unsupported:,
        allowed: MlPrediction::OUTPUTS
      )
    end

    def load_candles(snapshot)
      check_cancelled!
      source = candles ? candles_with_missing_warmup(snapshot) : query_candles(
        start_time: warmup_start_time(snapshot),
        end_time:
      )
      source.sort_by { |candle| candle.fetch(:time) }
    end

    def query_candles(start_time:, end_time:)
      Candle::FindQuery.new(
        symbol:,
        exchange:,
        timeframe:,
        start_time:,
        end_time:,
        limit: nil,
        preserve_decimals: true
      ).call
    end

    def candles_with_missing_warmup(snapshot)
      sorted = candles.sort_by { |candle| candle.fetch(:time) }
      return sorted if sorted.empty?

      warmup_start = timestamp_for_boundary(warmup_start_time(snapshot), field: 'warmup_start_time')
      first_loaded = sorted.first.fetch(:time).to_i
      return sorted unless warmup_start && first_loaded > warmup_start

      prefix_end = first_loaded - timeframe_duration_seconds
      return sorted if prefix_end < warmup_start

      prefix = cached_warmup_prefix(warmup_start, prefix_end)
      (prefix + sorted).uniq { |candle| candle.fetch(:time).to_i }
    end

    def cached_warmup_prefix(expanded_start, prefix_end)
      cache_key = [ exchange, symbol, timeframe, expanded_start, prefix_end ]
      return warmup_candle_cache[cache_key] if warmup_candle_cache&.key?(cache_key)

      prefix = query_candles(
        start_time: Time.at(expanded_start).utc,
        end_time: Time.at(prefix_end).utc
      )
      warmup_candle_cache[cache_key] = prefix if warmup_candle_cache
      prefix
    end

    def requested_candles(source_candles)
      return source_candles unless requested_start_timestamp || requested_end_timestamp

      source_candles.select { |candle| requested_time?(candle.fetch(:time).to_i) }
    end

    def rows_in_requested_range(rows)
      return rows unless requested_start_timestamp || requested_end_timestamp

      rows.select { |row| requested_time?(row.fetch(:time).to_i) }
    end

    def prediction_row_cap_error(normalized_outputs, candle_count)
      # MVP inference handles one model per call; multi-model batching must multiply by distinct model count.
      requested_prediction_rows = candle_count
      return if requested_prediction_rows <= PredictionRepository::MAX_CELLS

      {
        code: :prediction_cell_cap_exceeded,
        message: "prediction request exceeds #{PredictionRepository::MAX_CELLS} prediction rows",
        details: {
          requested_prediction_rows:,
          max_prediction_rows: PredictionRepository::MAX_CELLS,
          candle_count:,
          distinct_requested_models: 1,
          requested_outputs: normalized_outputs,
          hint: 'reduce the time range'
        }
      }
    end

    def capture_snapshot
      model = MlModel.eager_load(:latest_successful_training_run).find_by(key: model_key)
      raise InferenceFailure, error(:unknown_model, "unknown ML model: #{model_key}") unless model
      raise InferenceFailure, error(:model_not_trained, "ML model is not trained: #{model_key}") unless model.trained?

      training_run = model.latest_successful_training_run
      raise InferenceFailure, error(:missing_weights, "ML model weights are not available: #{model_key}") unless training_run
      compatibility_error = snapshot_compatibility_error(training_run)
      raise InferenceFailure, compatibility_error if compatibility_error
      feature_definition_error = snapshot_feature_definition_error(training_run)
      raise InferenceFailure, feature_definition_error if feature_definition_error

      weight_checksum = model.serving_weight_checksum.presence || training_run.weight_checksum
      weight_blob = MlModelWeightBlob.find_by(checksum: weight_checksum)
      raise InferenceFailure, error(:missing_weights, "ML model weights are not available: #{model_key}") unless weight_blob

      unless weight_checksum == training_run.weight_checksum && weight_checksum == weight_blob.checksum
        raise InferenceFailure, error(
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
        next unless expected_value.present?
        next if actual_value.present? && normalize_identity_value(key, actual_value) == normalize_identity_value(key, expected_value)

        { field: key, expected: expected_value, actual: actual_value }
      end
      return if mismatches.empty?

      error(
        :model_dataset_incompatible,
        "ML model is incompatible with requested dataset: #{model_key}",
        mismatches:
      )
    end

    def snapshot_feature_definition_error(training_run)
      mismatches = Ml::FeatureDefinitionCompatibility.new(training_run.resolved_feature_spec).mismatches
      return if mismatches.empty?

      error(
        :model_feature_definition_stale,
        "ML model feature definitions are stale: #{model_key}",
        mismatches: mismatches.map(&:to_h)
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
      validate_prediction_weights!(snapshot)

      missing_rows.each_slice(effective_batch_size) do |batch|
        check_cancelled!
        prediction_batch = predict_batch(batch, snapshot)
        unless prediction_batch.success?
          raise InferenceFailure, prediction_batch.error || error(:adapter_error, 'prediction adapter failed')
        end
        invalid_prediction_error = validate_prediction_batch(batch, prediction_batch.predictions)
        raise InferenceFailure, invalid_prediction_error if invalid_prediction_error

        current_by_time.merge!(repository.upsert_predictions(
          training_run: snapshot.training_run,
          rows: batch,
          predictions: prediction_batch.predictions,
          weight_checksum: snapshot.weight_checksum
        ))
        computed_rows += batch.length
      end

      computed_rows
    rescue ActiveRecord::ActiveRecordError => e
      raise InferenceFailure, error(:prediction_persistence_failed, e.message)
    end

    def predict_batch(batch, snapshot)
      adapter.predict(features: batch.map { |row| row.fetch(:features) }, weights: snapshot.weights_payload)
    rescue Research::Cancelled
      raise
    rescue StandardError => e
      raise InferenceFailure, error(:adapter_error, e.message, exception_class: e.class.name)
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

    def diagnostics_for(dataset:, requested_rows:, outputs:, reused_rows:, computed_rows:, source_window_mismatches:)
      dataset.diagnostics.merge(
        'loaded_candle_count' => dataset.rows.length,
        'candle_count' => requested_rows.length,
        'inference_rows' => requested_rows.length,
        'outputs' => outputs,
        'requested_prediction_rows' => requested_rows.length,
        'max_prediction_rows' => PredictionRepository::MAX_CELLS,
        'reused_prediction_rows' => reused_rows,
        'computed_prediction_rows' => computed_rows,
        'source_window_mismatches' => source_window_mismatches,
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

    def warmup_start_time(snapshot)
      return start_time unless requested_start_timestamp

      warmup = effective_window_for(snapshot)
      return start_time unless warmup.positive?

      Time.at(requested_start_timestamp).utc - (warmup * timeframe_duration_seconds)
    end

    def effective_window_for(snapshot)
      FeatureWindow.effective_window_for(Array(snapshot.resolved_feature_spec))
    end

    def timeframe_duration_seconds
      TimeframeParser.duration_seconds(timeframe)
    end

    def validate_timeframe
      timeframe_duration_seconds
      nil
    rescue ArgumentError => e
      error(:invalid_timeframe, e.message, timeframe:)
    end

    def validate_bounded_range_without_candles
      return if candles

      missing = []
      missing << 'start_time' unless requested_start_timestamp
      missing << 'end_time' unless requested_end_timestamp
      return if missing.empty?

      error(
        :prediction_range_unbounded,
        'prediction request requires start_time and end_time when candles are not provided',
        missing:,
        hint: 'provide a bounded time range or caller-loaded candles'
      )
    end

    def preflight_requested_candle_count
      return requested_candles(candles).length if candles
      return unless requested_start_timestamp && requested_end_timestamp

      duration = timeframe_duration_seconds
      range_seconds = requested_end_timestamp - requested_start_timestamp
      return 0 if range_seconds.negative?

      (range_seconds / duration).floor + 1
    end

    def requested_time?(timestamp)
      (!requested_start_timestamp || timestamp >= requested_start_timestamp) &&
        (!requested_end_timestamp || timestamp <= requested_end_timestamp)
    end

    def requested_start_timestamp
      @requested_start_timestamp ||= timestamp_for_boundary(start_time, field: 'start_time') || candles_boundary_timestamp(:min)
    end

    def requested_end_timestamp
      @requested_end_timestamp ||= timestamp_for_boundary(end_time, field: 'end_time') || candles_boundary_timestamp(:max)
    end

    def candles_boundary_timestamp(boundary)
      return unless candles

      timestamps = candles.filter_map { |candle| Time.at(candle.fetch(:time)).utc.to_i }
      boundary == :min ? timestamps.min : timestamps.max
    end

    def timestamp_for_boundary(value, field:)
      return if value.blank?

      parsed = value.to_time
      unless parsed
        raise InferenceFailure, error(
          :invalid_time_boundary,
          "invalid prediction time boundary: #{field}",
          field:,
          value: value.to_s
        )
      end

      parsed.utc.to_i
    rescue ArgumentError
      raise InferenceFailure, error(
        :invalid_time_boundary,
        "invalid prediction time boundary: #{field}",
        field:,
        value: value.to_s
      )
    end

    def normalize_symbol(value) = value.to_s.strip.upcase
    def normalize_exchange(value) = value.to_s.strip.downcase
    def normalize_timeframe(value) = value.to_s.strip.downcase

    def normalize_identity_value(key, value)
      case key.to_s
      when 'symbol' then normalize_symbol(value)
      when 'exchange' then normalize_exchange(value)
      when 'timeframe' then normalize_timeframe(value)
      else value.to_s.strip
      end
    end

    def check_cancelled!
      cancel_check.check_cancelled! if cancel_check
    end

    def validate_prediction_weights!(snapshot)
      if snapshot.weights_payload.blank?
        raise InferenceFailure, error(:missing_weights, "ML model weights are not available: #{model_key}")
      end

      return if snapshot.weights_format == MlModelWeightBlob::BASELINE_FORMAT

      raise InferenceFailure, error(:retrain_required, "unsupported weights format: #{snapshot.weights_format}")
    end

    def validate_prediction_batch(rows, predictions)
      predictions = Array(predictions)
      if predictions.length != rows.length
        return error(
          :adapter_invalid_prediction,
          'prediction adapter returned a different number of predictions than requested rows',
          expected_count: rows.length,
          actual_count: predictions.length
        )
      end

      rows.zip(predictions).each_with_index do |(row, prediction), index|
        invalid = invalid_prediction_details(row:, prediction:, index:)
        return error(:adapter_invalid_prediction, 'prediction adapter returned an invalid prediction', **invalid) if invalid
      end
      nil
    end

    def invalid_prediction_details(row:, prediction:, index:)
      return { index:, time: row.fetch(:time), reason: 'missing_prediction' } unless prediction

      probability = prediction_value(prediction, :probability)
      direction = prediction_value(prediction, :direction)
      confidence = prediction_value(prediction, :confidence)
      missing = []
      missing << 'probability' if probability.nil?
      missing << 'direction' if direction.nil?
      missing << 'confidence' if confidence.nil?
      return { index:, time: row.fetch(:time), reason: 'missing_fields', fields: missing } if missing.any?
      return { index:, time: row.fetch(:time), reason: 'invalid_direction', direction: } unless MlPrediction::DIRECTIONS.include?(direction.to_s)

      numeric_probability = numeric_prediction_value(probability)
      numeric_confidence = numeric_prediction_value(confidence)
      return { index:, time: row.fetch(:time), reason: 'probability_not_numeric', probability: } unless numeric_probability
      return { index:, time: row.fetch(:time), reason: 'confidence_not_numeric', confidence: } unless numeric_confidence
      return { index:, time: row.fetch(:time), reason: 'probability_out_of_range', probability: } unless numeric_probability.between?(0.0, 1.0)
      { index:, time: row.fetch(:time), reason: 'confidence_out_of_range', confidence: } unless numeric_confidence.between?(0.0, 1.0)
    end

    def prediction_value(prediction, key)
      prediction.fetch(key)
    end

    def numeric_prediction_value(value)
      Float(value, exception: false)
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
