# frozen_string_literal: true

module Research
  module Modules
    class Ema < Base
      def call(period:)
        TechnicalAnalysis::Ema.calculate(input_data, period: period.to_i, price_key: :close)
          .map(&:to_hash)
          .map do |point|
            {
              time: time_for(point[:date_time]),
              result: { value: point[:ema]&.to_f }
            }
          end
      end
    end
  end
end
