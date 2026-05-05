# frozen_string_literal: true

module Research
  module Modules
    class MlSignal < CandleAligned
      class Error < StandardError
        attr_reader :code, :details

        def initialize(message, code:, details: {})
          @code = code
          @details = details
          super(message)
        end
      end

      NUMERIC_OUTPUTS = %w[probability confidence].freeze

      def initialize(candles:, symbol: nil, timeframe: nil, exchange: 'bitfinex', start_time: nil, end_time: nil)
        super(candles:)
        @symbol = symbol.to_s.strip.presence
        @timeframe = timeframe.to_s.strip.presence
        @exchange = exchange.to_s.strip.presence || 'bitfinex'
        @start_time = start_time
        @end_time = end_time
        @warmup_candle_cache = {}
      end

      def call(model_key:, output: 'probability', cancel_check: nil, **)
        raise Error.new('ML model key is required', code: :model_key_required) if model_key.to_s.blank?
        raise Error.new('ML signal symbol is required', code: :symbol_required) if symbol.blank?
        raise Error.new('ML signal timeframe is required', code: :timeframe_required) if timeframe.blank?

        normalized_output = output.to_s
        unless NUMERIC_OUTPUTS.include?(normalized_output)
          raise Error.new("Unsupported numeric ML signal output: #{normalized_output}", code: :unsupported_output, details: { allowed: NUMERIC_OUTPUTS })
        end

        result = Ml::InferenceService.new(
          model_key: model_key.to_s,
          symbol:,
          timeframe:,
          exchange:,
          start_time: resolved_start_time,
          end_time: resolved_end_time,
          candles:,
          outputs: [ normalized_output ],
          cancel_check:,
          warmup_candle_cache:
        ).call
        raise Research::Cancelled if result.status == :cancelled || result.error&.code == :cancelled
        unless result.success?
          error = result.error
          raise Error.new(
            error&.message || 'ML inference failed',
            code: error&.code || :inference_failed,
            details: error&.details || {}
          )
        end

        result.series.map do |point|
          {
            time: point.fetch(:time),
            result: { value: point.dig(:values, normalized_output) }
          }
        end
      end

      private

      attr_reader :symbol, :timeframe, :exchange, :start_time, :end_time, :warmup_candle_cache

      def resolved_start_time
        return start_time if start_time
        return if candles.empty?

        Time.at(candles.first.fetch(:time)).utc
      end

      def resolved_end_time
        return end_time if end_time
        return if candles.empty?

        Time.at(candles.last.fetch(:time)).utc
      end
    end
  end
end
