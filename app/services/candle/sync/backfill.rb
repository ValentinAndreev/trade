# frozen_string_literal: true

class Candle
  module Sync
    class Backfill
      def initialize(symbol:, paginator:, exchange: Candle::Sync::EXCHANGE)
        @symbol = symbol
        @paginator = paginator
        @exchange = exchange
      end

      def call
        paginator.call(start_from: history_start_ms, refresh_aggregates: true, invalidate_min: true)
      end

      private

      attr_reader :symbol, :paginator, :exchange

      def history_start_ms
        earliest_candle = Candle.min_ts(symbol: symbol, exchange: exchange)
        return Candle::Sync.current_time_ms unless earliest_candle

        start_ms = (earliest_candle.to_i - 60) * 1000
        start_ms > Candle::Sync::HISTORY_START_MS ? start_ms : nil
      end
    end
  end
end
