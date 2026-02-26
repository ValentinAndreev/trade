# frozen_string_literal: true

class CandleSyncJob < ApplicationJob
  queue_as :default

  def perform
    BitfinexConfig.symbols.each_with_index do |symbol, index|
      CandleSyncSymbolJob.set(wait: index * 6.seconds).perform_later(symbol)
    end
  end
end
