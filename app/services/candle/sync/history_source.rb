# frozen_string_literal: true

class Candle
  module Sync
    class HistorySource
      def initialize(symbol:, interval:, client: Utils::BitfinexClient.new)
        @symbol = symbol
        @interval = interval
        @client = client
      end

      def fetch_records(end_time:, limit: Candle::Fetcher::MAX_LIMIT)
        fetch_candles(end_time: end_time, limit: limit).map do |mts, open, close, high, low, volume|
          {
            ts: Time.zone.at(mts / 1000),
            symbol: symbol,
            exchange: Candle::Fetcher::EXCHANGE,
            timeframe: interval,
            open: open,
            close: close,
            high: high,
            low: low,
            volume: volume
          }
        end
      end

      private

      attr_reader :symbol, :interval, :client

      def fetch_candles(end_time:, limit:, attempt: 0)
        client.candles_history(
          symbol: "#{Candle::Fetcher::SYMBOL_PREFIX}#{symbol}",
          interval: interval,
          end_time: end_time,
          limit: limit
        )
      rescue Utils::BitfinexClient::RateLimitError, Utils::BitfinexClient::ApiError => e
        raise Candle::Fetcher::FetchError, "Request failed after #{Candle::Fetcher::MAX_ATTEMPTS} attempts: #{e.message}" if attempt >= Candle::Fetcher::MAX_ATTEMPTS

        Rails.logger.warn("Candle::Fetcher retry #{attempt + 1}/#{Candle::Fetcher::MAX_ATTEMPTS}: #{e.message}")
        sleep(retry_pause)
        fetch_candles(end_time: end_time, limit: limit, attempt: attempt + 1)
      end

      def retry_pause
        Rails.env.test? ? 0.1 : 20
      end
    end
  end
end
