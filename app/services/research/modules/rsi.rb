# frozen_string_literal: true

module Research
  module Modules
    class Rsi
      private attr_reader :candles

      def initialize(candles:)
        @candles = candles
      end

      def call(period:)
        TechnicalAnalysis::Rsi.calculate(input_data, period: period.to_i, price_key: :close)
          .map(&:to_hash)
          .map do |point|
            {
              time: time_for(point[:date_time]),
              result: {
                value: point[:rsi]&.to_f
              }
            }
          end
      end

      private

      def input_data
        @input_data ||= candles.map do |candle|
          {
            date_time: Time.at(candle[:time]).utc.iso8601,
            open: candle[:open],
            high: candle[:high],
            low: candle[:low],
            close: candle[:close],
            volume: candle[:volume]
          }
        end
      end

      def time_lookup
        @time_lookup ||= input_data.each_with_index.each_with_object({}) do |(point, index), lookup|
          lookup[point[:date_time]] = candles[index][:time]
        end
      end

      def time_for(date_time)
        time_lookup.fetch(date_time.to_s)
      end
    end
  end
end
