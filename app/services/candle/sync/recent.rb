# frozen_string_literal: true

class Candle
  module Sync
    class Recent
      OVERLAP_CANDLES = 2
      MIN_FETCH_LIMIT = 5

      def initialize(symbol:, interval:, history_source:, importer:, broadcaster:, paginator:, exchange: Candle::Sync::EXCHANGE)
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
        return paginator.call(start_from: Candle::Sync.current_time_ms) unless gap

        limit = [ gap + OVERLAP_CANDLES, MIN_FETCH_LIMIT ].max
        records = history_source.fetch_records(
          end_time: Candle::Sync.current_time_ms,
          limit: [ limit, Candle::Sync::HistorySource::MAX_LIMIT ].min
        )
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
    end
  end
end
