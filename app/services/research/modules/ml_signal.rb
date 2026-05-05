# frozen_string_literal: true

module Research
  module Modules
    class MlSignal < Base
      class Error < StandardError
        attr_reader :code, :details

        def initialize(message, code:, details: {})
          @code = code
          @details = details
          super(message)
        end
      end

      def initialize(candles:, symbol: nil, timeframe: nil, exchange: 'bitfinex')
        super(candles:)
        @symbol = symbol
        @timeframe = timeframe
        @exchange = exchange
      end

      def call(model_key:, output: 'probability', cancel_check: nil, **)
        raise Error.new('ML model key is required', code: :model_key_required) if model_key.to_s.blank?

        result = Ml::InferenceService.new(
          model_key: model_key.to_s,
          symbol: symbol || inferred_symbol,
          timeframe: timeframe || inferred_timeframe,
          exchange:,
          candles:,
          outputs: [ output.to_s ],
          cancel_check:
        ).call
        raise Error.new(result.error.message, code: result.error.code, details: result.error.details || {}) unless result.success?

        result.series.map do |point|
          {
            time: point.fetch(:time),
            result: { value: point.dig(:values, output.to_s) }
          }
        end
      end

      private

      attr_reader :symbol, :timeframe, :exchange

      def inferred_symbol = candles.first&.fetch(:symbol, nil)&.to_s
      def inferred_timeframe = candles.first&.fetch(:timeframe, nil)&.to_s
    end
  end
end
