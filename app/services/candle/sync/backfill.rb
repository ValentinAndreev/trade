# frozen_string_literal: true

class Candle
  module Sync
    class Backfill
      def initialize(symbol:, paginator:, exchange: Candle::Fetcher::EXCHANGE)
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
        return current_time_ms unless earliest_candle

        start_ms = (earliest_candle.to_i - 60) * 1000
        start_ms > Candle::Fetcher::HISTORY_START_MS ? start_ms : nil
      end

      def current_time_ms
        Time.zone.now.to_i * 1000
      end
    end
  end
end
