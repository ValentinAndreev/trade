# frozen_string_literal: true

class Candle
  module Sync
    HISTORY_START_MS = Time.utc(2016, 1, 1).to_i * 1000
    EXCHANGE = 'bitfinex'

    class FetchError < StandardError; end

    def self.current_time_ms = Time.zone.now.to_i * 1000
  end
end
