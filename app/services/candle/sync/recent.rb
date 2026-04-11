# frozen_string_literal: true

class Candle
  module Sync
    class Recent
      def initialize(symbol:, interval:, history_source:, importer:, broadcaster:, paginator:, exchange: Candle::Fetcher::EXCHANGE)
        @symbol = symbol
        @interval = interval
        @history_source = history_source
        @importer = importer
        @broadcaster = broadcaster
        @paginator = paginator
        @exchange = exchange
      end

      def call
        gap = gap_minutes
        return paginator.call(start_from: current_time_ms) unless gap

        # Re-fetch a small overlap so the latest stored candle and the current boundary
        # candle are updated via upsert instead of relying on an exact gap calculation.
        limit = [ gap + Candle::Fetcher::RECENT_OVERLAP_CANDLES, Candle::Fetcher::MIN_RECENT_FETCH_LIMIT ].max
        records = history_source.fetch_records(end_time: current_time_ms, limit: [ limit, Candle::Fetcher::MAX_LIMIT ].min)
        return if records.empty?

        importer.upsert_recent(records)
        broadcaster.broadcast(records)
      end

      private

      attr_reader :symbol, :interval, :history_source, :importer, :broadcaster, :paginator, :exchange

      def gap_minutes
        latest_ts = Candle.max_ts(symbol: symbol, exchange: exchange)
        return nil unless latest_ts

        ((Time.zone.now - latest_ts) / 60).ceil
      end

      def current_time_ms
        Time.zone.now.to_i * 1000
      end
    end
  end
end
