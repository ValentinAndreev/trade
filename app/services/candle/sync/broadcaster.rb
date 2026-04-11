# frozen_string_literal: true

class Candle
  module Sync
    class Broadcaster
      def initialize(symbol:, interval:)
        @symbol = symbol
        @interval = interval
      end

      def broadcast(records)
        return if records.blank?

        candles = records.sort_by { |record| record[:ts] }.map do |record|
          {
            time: record[:ts].to_i,
            open: record[:open].to_f,
            high: record[:high].to_f,
            low: record[:low].to_f,
            close: record[:close].to_f,
            volume: record[:volume].to_f
          }
        end

        ActionCable.server.broadcast("candles:#{symbol}:#{interval}", candles)
      end

      private

      attr_reader :symbol, :interval
    end
  end
end
