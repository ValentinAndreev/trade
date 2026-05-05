# frozen_string_literal: true

module Ml
  class DatasetBuilder
    DEFAULT_DATASET_SPEC = {
      'prediction_target' => 'direction_classification',
      'label_horizon' => 1
    }.freeze
    DEFAULT_HYPERPARAMS = {
      'label_deadband_return' => 0.0
    }.freeze

    Result = Data.define(
      :examples, :rows, :diagnostics, :dataset_spec, :resolved_feature_spec,
      :effective_window, :fitted_metadata, :feature_names
    )

    def initialize(symbol:, timeframe:, exchange: 'bitfinex', start_time: nil, end_time: nil,
      dataset_spec: {}, feature_spec: nil, hyperparams: {}, candles: nil, cancel_check: nil)
      @symbol = symbol
      @timeframe = timeframe
      @exchange = exchange
      @start_time = start_time
      @end_time = end_time
      @dataset_spec = DEFAULT_DATASET_SPEC.merge(dataset_spec.to_h.deep_stringify_keys)
      @feature_spec = feature_spec
      @hyperparams = DEFAULT_HYPERPARAMS.merge(hyperparams.to_h.deep_stringify_keys)
      @candles = candles
      @cancel_check = cancel_check
    end

    def build_training
      matrix = feature_matrix
      examples = []
      diagnostics = base_diagnostics.merge(
        'training_examples' => 0,
        'insufficient_history_rows' => 0,
        'missing_future_label_rows' => 0,
        'deadband_rows' => 0,
        'invalid_label_rows' => 0
      )

      matrix.rows.each_with_index do |row, index|
        check_cancelled! if (index % 512).zero?

        unless row.fetch(:complete)
          diagnostics['insufficient_history_rows'] += 1
          next
        end

        future_index = index + label_horizon
        unless future_index < candles.length
          diagnostics['missing_future_label_rows'] += 1
          next
        end

        label_payload = label_for(index, future_index)
        unless label_payload
          diagnostics['invalid_label_rows'] += 1
          next
        end

        if label_payload.fetch(:label).nil?
          diagnostics['deadband_rows'] += 1
          next
        end

        examples << row.merge(label: label_payload.fetch(:label), label_return: label_payload.fetch(:label_return))
      end

      diagnostics['training_examples'] = examples.length
      result_for(matrix, examples:, rows: matrix.rows, diagnostics:)
    end

    def build_inference
      matrix = feature_matrix
      diagnostics = base_diagnostics.merge(
        'inference_rows' => matrix.rows.length,
        'insufficient_history_rows' => matrix.rows.count { |row| !row.fetch(:complete) }
      )

      result_for(matrix, examples: [], rows: matrix.rows, diagnostics:)
    end

    private

    attr_reader :symbol, :timeframe, :exchange, :start_time, :end_time,
      :dataset_spec, :feature_spec, :hyperparams, :cancel_check

    def result_for(matrix, examples:, rows:, diagnostics:)
      Result.new(
        examples:,
        rows:,
        diagnostics:,
        dataset_spec: resolved_dataset_spec,
        resolved_feature_spec: matrix.resolved_feature_spec,
        effective_window: matrix.effective_window,
        fitted_metadata: matrix.fitted_metadata,
        feature_names: matrix.feature_names
      )
    end

    def feature_matrix
      @feature_matrix ||= begin
        window = FeatureWindow.new(feature_spec:)
        FeatureMatrix.new(
          candles:,
          resolved_feature_spec: window.resolved_feature_spec,
          cancel_check:
        ).call
      end
    end

    def candles
      @loaded_candles ||= begin
        check_cancelled!
        source_candles = @candles || Candle::FindQuery.new(
          symbol:,
          exchange:,
          timeframe:,
          start_time:,
          end_time:,
          limit: nil
        ).call
        source_candles.sort_by { |candle| candle.fetch(:time) }
      end
    end

    def label_for(index, future_index)
      current_close = candles[index].fetch(:close).to_f
      future_close = candles[future_index].fetch(:close).to_f
      return if current_close <= 0 || future_close <= 0

      label_return = (future_close / current_close) - 1.0
      label = if label_return > label_deadband_return
        'up'
      elsif label_return < -label_deadband_return
        'down'
      end
      { label:, label_return: }
    end

    def label_horizon = dataset_spec.fetch('label_horizon').to_i
    def label_deadband_return = hyperparams.fetch('label_deadband_return').to_f

    def resolved_dataset_spec
      dataset_spec.merge(
        'symbol' => symbol,
        'exchange' => exchange,
        'timeframe' => timeframe,
        'start_time' => candles.first ? Time.at(candles.first.fetch(:time)).utc.iso8601 : nil,
        'end_time' => candles.last ? Time.at(candles.last.fetch(:time)).utc.iso8601 : nil,
        'label_horizon' => label_horizon,
        'label_deadband_return' => label_deadband_return
      )
    end

    def base_diagnostics
      {
        'candle_count' => candles.length,
        'effective_window' => feature_matrix.effective_window,
        'label_horizon' => label_horizon,
        'label_deadband_return' => label_deadband_return
      }
    end

    def check_cancelled!
      if cancel_check.respond_to?(:check_cancelled!)
        cancel_check.check_cancelled!
      elsif cancel_check.respond_to?(:call) && cancel_check.call
        raise Ml::Cancelled
      end
    end
  end
end
