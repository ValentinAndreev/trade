# frozen_string_literal: true

module Research
  module Modules
    class Native < CandleAligned
      class << self
        def module_key = name.demodulize.underscore.to_sym
        def indicator_name = indicator_definition.fetch(:label)
        def valid_options = params_definition.keys
        def min_data_size = IndicatorsConfig.warmup_for(module_key) + 1

        def coerce_params(raw_params)
          symbolized_params = raw_params.to_h.transform_keys(&:to_sym)
          params_definition.each_with_object({}) do |(key, param), result|
            raw_value = symbolized_params.key?(key) ? symbolized_params[key] : param.default
            next if raw_value.nil?

            value = param.coerce!(raw_value, key:)
            validate_param!(key, value, param)
            result[key] = value
          end
        end

        private

        def indicator_definition = IndicatorsConfig.all.fetch(module_key)
        def params_definition = indicator_definition.fetch(:params)

        def validate_param!(key, value, param)
          raise ArgumentError, "#{key} must be >= #{param.min}" if param.min && value.to_f < param.min.to_f
          raise ArgumentError, "#{key} must be <= #{param.max}" if param.max && value.to_f > param.max.to_f

          allowed = param.values
          return unless allowed.is_a?(Array)
          return if allowed.map(&:to_s).include?(value.to_s)

          raise ArgumentError, "#{key} must be one of: #{allowed.join(', ')}"
        end
      end

      def call(cancel_check: nil, **params)
        points_for(self.class.coerce_params(params), cancel_check:)
      end

      def call_resolved(cancel_check: nil, **params)
        points_for(params, cancel_check:)
      end

      def call_from_feature_matrix(cancel_check: nil, **params)
        call_resolved(**params, cancel_check:)
      end

      private

      def points_for(options, cancel_check: nil)
        candles.each_with_index.map do |candle, index|
          check_cancelled!(cancel_check) if (index % 512).zero?

          { time: candle.fetch(:time), result: { value: finite_or_nil(value_at(index, **options)) } }
        end
      end

      def value_at(_index, **)
        raise NotImplementedError
      end

      def close_at(index) = numeric_field(index, :close)

      def numeric_field(index, field)
        return if index.negative?

        value = candles[index]&.fetch(field.to_sym, nil)
        return if value.nil?

        value.to_f
      end

      def window_values(index, period, field: :close)
        return if index < period - 1

        values = ((index - period + 1)..index).map { |window_index| numeric_field(window_index, field) }
        return if values.any?(&:nil?)

        values
      end

      def rolling_log_returns(index, period)
        return if index < period

        ((index - period + 1)..index).map do |return_index|
          previous_close = close_at(return_index - 1)
          current_close = close_at(return_index)
          return if previous_close.nil? || current_close.nil? || previous_close <= 0 || current_close <= 0

          Math.log(current_close / previous_close)
        end
      end

      def volatility_at(index, period)
        returns = rolling_log_returns(index, period)
        return unless returns

        population_stddev(returns)
      end

      def population_stddev(values)
        return if values.empty?

        avg = mean(values)
        Math.sqrt(values.sum { |value| (value - avg)**2 } / values.length)
      end

      def mean(values) = values.sum / values.length.to_f

      def clamp(value, min, max)
        [ [ value, min ].max, max ].min
      end

      def finite_or_nil(value)
        value&.finite? ? value : nil
      end
    end

    class LogReturn < Native
      private

      def value_at(index, period:)
        return if index < period

        previous_close = close_at(index - period)
        current_close = close_at(index)
        return if previous_close.nil? || current_close.nil? || previous_close <= 0 || current_close <= 0

        Math.log(current_close / previous_close)
      end
    end

    class RollingVolatility < Native
      private

      def value_at(index, period:) = volatility_at(index, period)
    end

    class RangePosition < Native
      private

      def value_at(index, period:)
        highs = window_values(index, period, field: :high)
        lows = window_values(index, period, field: :low)
        close = close_at(index)
        return unless highs && lows && close

        low = lows.min
        range = highs.max - low
        return if range.zero?

        clamp((close - low) / range, 0.0, 1.0)
      end
    end

    class RollingZscore < Native
      private

      def value_at(index, period:)
        values = window_values(index, period, field: :close)
        close = close_at(index)
        return unless values && close

        standard_deviation = population_stddev(values)
        return if standard_deviation.to_f.zero?

        (close - mean(values)) / standard_deviation
      end
    end

    class PercentileRank < Native
      private

      def value_at(index, period:)
        values = window_values(index, period, field: :close)
        close = close_at(index)
        return unless values && close

        values.count { |value| value <= close } / period.to_f
      end
    end

    class TrendRegimeScore < Native
      private

      def value_at(index, period:)
        return if index < period

        previous_close = close_at(index - period)
        current_close = close_at(index)
        volatility = volatility_at(index, period)
        return if previous_close.nil? || current_close.nil? || volatility.nil?
        return if previous_close <= 0 || current_close <= 0 || volatility.zero?

        Math.tanh(Math.log(current_close / previous_close) / (volatility * Math.sqrt(period)))
      end
    end

    class VolRegimeScore < Native
      private

      def value_at(index, short_period:, long_period:)
        short_volatility = volatility_at(index, short_period)
        long_volatility = volatility_at(index, long_period)
        return if short_volatility.nil? || long_volatility.to_f.zero?

        ratio = short_volatility / long_volatility
        clamp(ratio / (1.0 + ratio), 0.0, 1.0)
      end
    end

    class VolAdjust < Native
      private

      def value_at(index, period:, field: 'close', epsilon: 0.00000001)
        value = numeric_field(index, field)
        volatility = volatility_at(index, period)
        return if value.nil? || volatility.nil?

        value / [ volatility, epsilon ].max
      end
    end
  end
end
