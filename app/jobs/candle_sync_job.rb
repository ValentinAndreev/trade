# frozen_string_literal: true

class CandleSyncJob < ApplicationJob
  queue_as :default

  def perform
    BitfinexConfig.symbols.each do |symbol|
      Candle::Fetcher.new(symbol).call
      sleep(BitfinexConfig.sync_pause)
    rescue Candle::Fetcher::FetchError => e
      Rails.logger.error("CandleSyncJob: #{symbol} failed: #{e.message}")
    end
  end
end
