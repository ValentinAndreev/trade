# frozen_string_literal: true

module Research
  module Modules
    class ExternalSeries < Base
      def call(key:, **)
        raise ArgumentError, 'External series key is required' if key.to_s.empty?

        entry = Macro::Catalog.find(key.to_s)
        raise ArgumentError, "Unknown external series key: #{key}" unless entry

        align_series(series_for(key.to_s, source: entry.source))
      end

      private

      def series_for(metric_key, source:)
        return [] if candles.empty?

        Macro::FindQuery.new(
          indicators: [ metric_key ],
          source:,
          from: Time.at(candles.first.fetch(:time)).utc,
          to: Time.at(candles.last.fetch(:time)).utc,
          gapfill: false
        ).call.fetch(metric_key, [])
      end

      def align_series(pairs)
        sorted_pairs = pairs.sort_by(&:first)
        pair_index = 0
        current_value = nil

        candles.map do |candle|
          ts = candle.fetch(:time)
          while pair_index < sorted_pairs.size && sorted_pairs[pair_index].first <= ts
            current_value = sorted_pairs[pair_index].last
            pair_index += 1
          end

          { time: ts, result: { value: current_value } }
        end
      end
    end
  end
end
