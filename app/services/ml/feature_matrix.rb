# frozen_string_literal: true

module Ml
  class FeatureMatrix
    Result = Data.define(
      :rows, :feature_names, :resolved_feature_spec, :effective_window, :fitted_metadata
    )

    def initialize(candles:, resolved_feature_spec:, cancel_check: nil)
      @candles = candles
      @resolved_feature_spec = resolved_feature_spec
      @cancel_check = Research::CancellationCheck.wrap(cancel_check)
    end

    def call
      check_cancelled!

      series_by_name = build_feature_series
      checksum = SourceWindowChecksum.new(candles)
      rows = candles.each_with_index.map do |candle, index|
        check_cancelled! if (index % 512).zero?

        features = feature_names.index_with { |name| series_by_name.fetch(name)[index] }
        complete = features.values.none?(&:nil?) && index >= effective_window
        {
          time: candle.fetch(:time),
          features:,
          complete:,
          source_window_checksum: complete ? checksum.window_checksum(start_index: index - effective_window, end_index: index) : nil
        }
      end

      Result.new(
        rows:,
        feature_names:,
        resolved_feature_spec:,
        effective_window:,
        fitted_metadata:
      )
    end

    private

    attr_reader :candles, :resolved_feature_spec, :cancel_check

    def build_feature_series
      resolved_feature_spec.each_with_object({}) do |feature, acc|
        check_cancelled!

        module_points = module_points_for(feature)
        feature.fetch('outputs').each do |output|
          feature_name = feature.dig('feature_names', output)
          acc[feature_name] = candles.map.with_index do |candle, index|
            point = module_points[index]
            point && point.fetch(:time) == candle.fetch(:time) ? point.dig(:result, output.to_sym) : nil
          end
        end
      end
    end

    def module_points_for(feature)
      runner = Research::Modules.for(feature.fetch('type')).new(candles:)
      params = feature.fetch('params').deep_symbolize_keys
      runner.call_from_feature_matrix(**params, cancel_check:)
    end

    def feature_names
      @feature_names ||= resolved_feature_spec.flat_map { |feature| feature.fetch('feature_names').values }
    end

    def effective_window
      @effective_window ||= resolved_feature_spec.map { |entry| [ entry.fetch('warmup'), entry.fetch('lookback') ].max }.max || 0
    end

    def fitted_metadata
      {
        'normalization' => 'module_outputs_no_fit:v1',
        'fit_scope' => 'training_rows_only',
        'feature_names' => feature_names
      }
    end

    def check_cancelled!
      cancel_check.check_cancelled! if cancel_check
    end
  end
end
