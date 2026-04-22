# frozen_string_literal: true

module Research
  module Runtime
    class RowCursor < Struct.new(:candles, :module_series, :index, keyword_init: true)
      EMPTY_HASH = {}.freeze
      EMPTY_SERIES = [].freeze

      def [](key)
        case key
        when :time then candle[:time]
        when :bar then candle
        when :result then current_results
        end
      end

      def dig(*keys)
        return if keys.empty?

        case keys.first
        when :time
          keys.length == 1 ? candle[:time] : nil
        when :bar
          dig_value(candle, keys.drop(1))
        when :result
          module_name = keys[1]
          dig_value(module_result(module_name), keys.drop(2))
        end
      end

      def dig_at(offset, *keys)
        return if keys.empty?

        target_index = index - offset.to_i
        return if target_index.negative?

        case keys.first
        when :time
          keys.length == 1 ? candle_at(target_index)[:time] : nil
        when :bar
          dig_value(candle_at(target_index), keys.drop(1))
        when :result
          module_name = keys[1]
          dig_value(module_result_at(module_name, target_index), keys.drop(2))
        end
      end

      private

      def candle = candles[index] || EMPTY_HASH
      def candle_at(target_index) = candles[target_index] || EMPTY_HASH
      def module_result(module_name) = (module_series[module_name.to_sym] || EMPTY_SERIES)[index] || EMPTY_HASH
      def module_result_at(module_name, target_index) = (module_series[module_name.to_sym] || EMPTY_SERIES)[target_index] || EMPTY_HASH

      def current_results
        module_series.each_with_object({}) do |(module_name, results), acc|
          acc[module_name] = results[index] || EMPTY_HASH
        end
      end

      def dig_value(value, keys)
        return value if keys.empty?

        value.dig(*keys)
      end
    end
  end
end
