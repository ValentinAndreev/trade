# frozen_string_literal: true

class Candle
  module Sync
    class Importer
      def initialize(symbol:, exchange: Candle::Sync::EXCHANGE)
        @symbol = symbol
        @exchange = exchange
      end

      def upsert_recent(records)
        Candle.upsert_recent(records)
        invalidate_cache(:max)
      end

      def import(records, invalidate_min: false)
        imported_timestamps = Candle.import(records).rows.flatten
        return imported_timestamps if imported_timestamps.empty?

        invalidate_cache(:max)
        invalidate_cache(:min) if invalidate_min
        imported_timestamps
      end

      private

      attr_reader :symbol, :exchange

      def invalidate_cache(kind)
        Rails.cache.delete("candle/#{kind}_ts/#{symbol}/#{exchange}")
      end
    end
  end
end
