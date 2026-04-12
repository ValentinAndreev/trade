# frozen_string_literal: true

class Candle
  module Sync
    class HistorySource
      MAX_LIMIT = 10_000
      MAX_ATTEMPTS = 5
      SYMBOL_PREFIX = 't'

      def initialize(symbol:, interval:, client: Utils::BitfinexClient.new)
        @symbol = symbol
        @interval = interval
        @client = client
      end

      def fetch_records(end_time:, limit: MAX_LIMIT)
        fetch_candles(end_time:, limit:).map do |mts, open, close, high, low, volume|
          {
            ts: Time.zone.at(mts / 1000),
            symbol:,
            exchange: Candle::Sync::EXCHANGE,
            timeframe: interval,
            open:,
            close:,
            high:,
            low:,
            volume:
          }
        end
      end

      private

      attr_reader :symbol, :interval, :client

      def fetch_candles(end_time:, limit:, attempt: 0)
        client.candles_history(
          symbol: "#{SYMBOL_PREFIX}#{symbol}",
          interval:,
          end_time:,
          limit:
        )
      rescue Utils::BitfinexClient::RateLimitError, Utils::BitfinexClient::ApiError => e
        raise Candle::Sync::FetchError, "Request failed after #{MAX_ATTEMPTS} attempts: #{e.message}" if attempt >= MAX_ATTEMPTS

        Rails.logger.warn("Candle::Sync retry #{attempt + 1}/#{MAX_ATTEMPTS}: #{e.message}")
        sleep(retry_pause)
        fetch_candles(end_time:, limit:, attempt: attempt + 1)
      end

      def retry_pause = Rails.env.test? ? 0.1 : 20
    end
  end
end
