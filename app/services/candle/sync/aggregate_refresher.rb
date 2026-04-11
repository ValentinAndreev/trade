# frozen_string_literal: true

class Candle
  module Sync
    class AggregateRefresher
      def initialize(connection: ActiveRecord::Base.connection)
        @connection = connection
      end

      def refresh(imported_timestamps)
        return if imported_timestamps.blank?

        min_ts = imported_timestamps.min
        max_ts = imported_timestamps.max

        Candle::Fetcher::CONTINUOUS_AGGREGATE_BUCKETS.each do |view_name, bucket_size|
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
