# frozen_string_literal: true

class CandleSyncJob < ApplicationJob
  queue_as :default

  def perform
    reachable = Utils::BitfinexHealth.check!
    broadcast_status(reachable)

    unless reachable
      Rails.logger.info('CandleSyncJob: Bitfinex unreachable, skipping sync')
      return
    end

    BitfinexConfig.symbols.each do |symbol|
      Candle::Fetcher.new(symbol).call
      sleep(BitfinexConfig.sync_pause)
    rescue Candle::Fetcher::FetchError => e
      Rails.logger.error("CandleSyncJob: #{symbol} failed: #{e.message}")
    end
  end

  private

  def broadcast_status(reachable) = ActionCable.server.broadcast('exchange:status', { bitfinex: reachable })
end
