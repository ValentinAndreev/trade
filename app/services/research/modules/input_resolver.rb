# frozen_string_literal: true

module Research
  module Modules
    class InputResolver
      OHLCV_FIELDS = %w[open high low close volume].freeze

      def initialize(candles:, module_series: {}, cancel_check: nil)
        @candles = candles
        @module_series = module_series
        @cancel_check = cancel_check
      end

      def values(reference)
        ref = reference
        case ref.fetch('kind')
        when 'ohlcv'
          ohlcv_values(ref.fetch('field'))
        when 'module'
          module_values(module_ref: ref.fetch('module_ref'), output: ref.fetch('output'))
        when 'external_series'
          external_series_values(key: ref.fetch('key'), output: ref.fetch('output'))
        else
          raise ArgumentError, "Unsupported input reference kind: #{ref.fetch('kind')}"
        end
      end

      private

      attr_reader :candles, :module_series, :cancel_check

      def ohlcv_values(field)
        raise ArgumentError, "Unsupported OHLCV field: #{field}" unless OHLCV_FIELDS.include?(field)

        candles.map.with_index do |candle, index|
          check_cancelled!(index)
          numeric(candle.fetch(field.to_sym))
        end
      end

      def module_values(module_ref:, output:)
        series = module_series.fetch(module_ref.to_sym)

        series.map.with_index do |result, index|
          check_cancelled!(index)
          numeric(result.fetch(output.to_sym))
        end
      end

      def external_series_values(key:, output:)
        raise ArgumentError, 'External series input only supports output=value' unless output == 'value'

        entry = Macro::Catalog.find(key)
        raise ArgumentError, "Unknown external series key: #{key}" unless entry
        return [] if candles.empty?

        pairs = Macro::FindQuery.new(
          indicators: [ key ],
          source: entry.source,
          from: first_candle_time,
          to: last_candle_time,
          gapfill: false
        ).call.fetch(key, [])
        align_pairs(pairs)
      end

      def align_pairs(pairs)
        sorted = pairs.sort_by(&:first)
        pair_index = 0
        current_value = nil

        candles.map.with_index do |candle, index|
          check_cancelled!(index)
          ts = candle.fetch(:time)
          while pair_index < sorted.length && sorted[pair_index].first <= ts
            current_value = sorted[pair_index].last
            pair_index += 1
          end
          numeric(current_value)
        end
      end

      def first_candle_time
        candles.first ? Time.at(candles.first.fetch(:time)).utc : nil
      end

      def last_candle_time
        candles.last ? Time.at(candles.last.fetch(:time)).utc : nil
      end

      def numeric(value)
        Float(value, exception: false)
      end

      def check_cancelled!(index)
        cancel_check&.check_cancelled! if (index % 512).zero?
      end
    end
  end
end
