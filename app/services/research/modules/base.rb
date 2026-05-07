# frozen_string_literal: true

module Research
  module Modules
    class Base < CandleAligned
      def call(cancel_check: nil, module_series: {}, **params)
        check_cancelled!(cancel_check)
        ta_params = ta_class.valid_options.include?(:price_key) ? params.merge(price_key: :close) : params
        result = ta_class.calculate(input_data, **ta_params)
          .map { |point| { time: time_for(point.date_time), result: result_from(point) } }

        check_cancelled!(cancel_check)
        result
      end

      private

      def ta_class = "TechnicalAnalysis::#{self.class.name.demodulize}".constantize

      def result_from(point)
        hash = point.to_hash.except(:date_time)
        hash.size == 1 ? { value: hash.values.first } : hash
      end

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

      def time_for(date_time) = time_lookup.fetch(date_time.to_s)
    end
  end
end
