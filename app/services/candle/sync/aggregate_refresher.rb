# frozen_string_literal: true

class Candle
  module Sync
    class AggregateRefresher
      CONTINUOUS_AGGREGATE_BUCKETS = {
        'cagg_candles_5m' => 5.minutes,
        'cagg_candles_15m' => 15.minutes,
        'cagg_candles_1h' => 1.hour,
        'cagg_candles_4h' => 4.hours,
        'cagg_candles_1d' => 1.day
      }.freeze

      def initialize(connection: ActiveRecord::Base.connection)
        @connection = connection
      end

      def refresh(imported_timestamps)
        return if imported_timestamps.blank?

        min_ts = imported_timestamps.min
        max_ts = imported_timestamps.max

        CONTINUOUS_AGGREGATE_BUCKETS.each do |view_name, bucket_size|
          sql = Candle.sanitize_sql_array([
            'CALL refresh_continuous_aggregate(?, ?::timestamptz, ?::timestamptz)',
            view_name,
            (min_ts - bucket_size).utc,
            (max_ts + bucket_size).utc
          ])
          connection.execute(sql)
        end
      end

      private

      attr_reader :connection
    end
  end
end
