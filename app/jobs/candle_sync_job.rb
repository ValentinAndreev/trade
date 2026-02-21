# frozen_string_literal: true

class CandleSyncJob < ApplicationJob
  queue_as :default

  def perform
    BitfinexConfig.symbols.each do |symbol|
      pair = symbol.delete_prefix('t')
      Candle::Fetcher.new(pair).call
    end
  end
end
