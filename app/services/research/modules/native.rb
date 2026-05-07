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
          params_definition.each_with_object({}) do |(key, param), result|
            raw_value = raw_params.key?(key) ? raw_params.fetch(key) : param.default
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
          return if allowed.nil?
          return if allowed.map(&:to_s).include?(value.to_s)

          raise ArgumentError, "#{key} must be one of: #{allowed.join(', ')}"
        end
      end

      def call(cancel_check: nil, module_series: {}, **params)
        points_for(self.class.coerce_params(params), cancel_check:, module_series:)
      end

      def call_resolved(cancel_check: nil, module_series: {}, **params)
        points_for(params, cancel_check:, module_series:)
      end

      def call_from_feature_matrix(cancel_check: nil, module_series: {}, **params)
        call_resolved(**params, cancel_check:, module_series:)
      end

      private

      def points_for(options, cancel_check: nil, module_series: {})
        prepared_options = prepare_options(options, cancel_check:, module_series:)
        candles.each_with_index.map do |candle, index|
          check_cancelled!(cancel_check) if (index % 512).zero?

          { time: candle.fetch(:time), result: { value: value_at(index, **prepared_options) } }
        end
      end

      def prepare_options(options, cancel_check: nil, module_series: {}) = options

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

      def population_variance(values)
        return if values.empty?

        avg = mean(values)
        values.sum { |value| (value - avg)**2 } / values.length
      end

      def mean(values) = values.sum / values.length.to_f

      def median(values)
        return if values.empty?

        sorted = values.sort
        mid = sorted.length / 2
        sorted.length.odd? ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2.0
      end

      def quantile(values, probability)
        return if values.empty?

        sorted = values.sort
        position = probability.to_f.clamp(0.0, 1.0) * (sorted.length - 1)
        lower = position.floor
        upper = position.ceil
        return sorted[lower] if lower == upper

        sorted[lower] + ((sorted[upper] - sorted[lower]) * (position - lower))
      end

      def input_values(reference, cancel_check: nil, module_series:)
        Research::Modules::InputResolver.new(
          candles:,
          module_series:,
          cancel_check:
        ).values(reference)
      end

      def input_window(values, index, period)
        return if index < period - 1

        window = values[(index - period + 1)..index]
        return if window.nil? || window.length != period || window.any?(&:nil?)

        window
      end

      def clamp(value, min, max)
        [ [ value, min ].max, max ].min
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

    class InputTransform < Native
      def self.depends_on_module_series? = true

      private

      def prepare_options(options, cancel_check: nil, module_series: {})
        options.except(:input).merge(input_values: input_values(options.fetch(:input), cancel_check:, module_series:))
      end
    end

    class Lag < InputTransform
      private

      def value_at(index, input_values:, period:)
        return if index < period

        input_values[index - period]
      end
    end

    class Delta < InputTransform
      private

      def value_at(index, input_values:, period:)
        return if index < period

        current = input_values[index]
        previous = input_values[index - period]
        return if current.nil? || previous.nil?

        current - previous
      end
    end

    class RollingMean < InputTransform
      private

      def value_at(index, input_values:, period:)
        values = input_window(input_values, index, period)
        mean(values) if values
      end
    end

    class RollingStd < InputTransform
      private

      def value_at(index, input_values:, period:)
        values = input_window(input_values, index, period)
        population_stddev(values) if values
      end
    end

    class EmaSmoother < InputTransform
      private

      def value_at(index, input_values:, period:)
        values = input_window(input_values, index, period)
        return unless values

        alpha = 2.0 / (period + 1.0)
        values.drop(1).reduce(values.first) { |ema, value| (value * alpha) + (ema * (1.0 - alpha)) }
      end
    end

    class Clip < InputTransform
      private

      def value_at(index, input_values:, min_value: nil, max_value: nil)
        value = input_values[index]
        return if value.nil?

        lower = min_value.nil? ? value : [ value, min_value ].max
        max_value.nil? ? lower : [ lower, max_value ].min
      end
    end

    class Winsorize < InputTransform
      private

      def value_at(index, input_values:, period:, lower_quantile:, upper_quantile:)
        values = input_window(input_values, index, period)
        current = input_values[index]
        return unless values && current

        lower = quantile(values, lower_quantile)
        upper = quantile(values, upper_quantile)
        clamp(current, lower, upper)
      end
    end

    class Zscore < InputTransform
      private

      def value_at(index, input_values:, period:)
        values = input_window(input_values, index, period)
        current = input_values[index]
        return unless values && current

        standard_deviation = population_stddev(values)
        return if standard_deviation.to_f.zero?

        (current - mean(values)) / standard_deviation
      end
    end

    class RobustZscore < InputTransform
      private

      def value_at(index, input_values:, period:, epsilon: 0.00000001)
        values = input_window(input_values, index, period)
        current = input_values[index]
        return unless values && current

        center = median(values)
        deviations = values.map { |value| (value - center).abs }
        scale = [ 1.4826 * median(deviations), epsilon ].max
        (current - center) / scale
      end
    end

    class MinmaxPosition < InputTransform
      private

      def value_at(index, input_values:, period:)
        values = input_window(input_values, index, period)
        current = input_values[index]
        return unless values && current

        min = values.min
        range = values.max - min
        return if range.zero?

        clamp((current - min) / range, 0.0, 1.0)
      end
    end

    class PairTransform < Native
      def self.depends_on_module_series? = true

      private

      def prepare_options(options, cancel_check: nil, module_series: {})
        options.except(:left, :right).merge(
          left_values: input_values(options.fetch(:left), cancel_check:, module_series:),
          right_values: input_values(options.fetch(:right), cancel_check:, module_series:)
        )
      end
    end

    class Spread < PairTransform
      private

      def value_at(index, left_values:, right_values:)
        left = left_values[index]
        right = right_values[index]
        return if left.nil? || right.nil?

        left - right
      end
    end

    class Ratio < PairTransform
      private

      def value_at(index, left_values:, right_values:, epsilon: 0.00000001)
        left = left_values[index]
        right = right_values[index]
        return if left.nil? || right.nil? || right.abs <= epsilon

        left / right
      end
    end

    class RollingCorr < PairTransform
      private

      def value_at(index, left_values:, right_values:, period:)
        left_window = input_window(left_values, index, period)
        right_window = input_window(right_values, index, period)
        return unless left_window && right_window

        left_std = population_stddev(left_window)
        right_std = population_stddev(right_window)
        return if left_std.to_f.zero? || right_std.to_f.zero?

        left_mean = mean(left_window)
        right_mean = mean(right_window)
        covariance = left_window.zip(right_window).sum { |left, right| (left - left_mean) * (right - right_mean) } / period.to_f
        covariance / (left_std * right_std)
      end
    end

    class StationarityProxy < InputTransform
      private

      def value_at(index, input_values:, period:, epsilon: 0.00000001)
        current_window = input_window(input_values, index, period)
        previous_window = input_window(input_values, index - period, period)
        return unless current_window && previous_window

        combined = previous_window + current_window
        drift = (mean(current_window) - mean(previous_window)).abs / (population_stddev(combined) + epsilon)
        1.0 - clamp(drift, 0.0, 1.0)
      end
    end

    class HeteroskedasticityProxy < InputTransform
      private

      def value_at(index, input_values:, period:, epsilon: 0.00000001)
        current_window = input_window(input_values, index, period)
        previous_window = input_window(input_values, index - period, period)
        return unless current_window && previous_window

        combined_variance = population_variance(previous_window + current_window)
        return if combined_variance.nil?

        variance_change = (population_variance(current_window) - population_variance(previous_window)).abs
        clamp(variance_change / (combined_variance + epsilon), 0.0, 1.0)
      end
    end
  end
end
