# frozen_string_literal: true

require 'set'

class Candle
  module Sync
    class Paginator
      def initialize(history_source:, importer:, broadcaster:, aggregate_refresher:, rate_limit_pause: BitfinexConfig.rate_limit_pause)
        @history_source = history_source
        @importer = importer
        @broadcaster = broadcaster
        @aggregate_refresher = aggregate_refresher
        @rate_limit_pause = rate_limit_pause
      end

      def call(start_from:, refresh_aggregates: false, invalidate_min: false)
        end_ms = start_from
        first_batch = true

        loop do
          break unless end_ms

          records = history_source.fetch_records(end_time: end_ms)
          break if records.empty?

          imported_timestamps = importer.import(records, invalidate_min: invalidate_min)
          break if imported_timestamps.empty?

          broadcaster.broadcast(imported_records(records, imported_timestamps)) if first_batch
          aggregate_refresher.refresh(imported_timestamps) if refresh_aggregates

          first_batch = false
          end_ms = next_page_ms(imported_timestamps.min)

          sleep(rate_limit_pause)
        end
      end

      private

      attr_reader :history_source, :importer, :broadcaster, :aggregate_refresher, :rate_limit_pause

      def imported_records(records, imported_timestamps)
        imported_set = imported_timestamps.to_set
        records.select { |record| imported_set.include?(record[:ts]) }
      end

      def next_page_ms(oldest_timestamp)
        end_ms = (oldest_timestamp.to_i - 60) * 1000
        end_ms > Candle::Fetcher::HISTORY_START_MS ? end_ms : nil
      end
    end
  end
end
