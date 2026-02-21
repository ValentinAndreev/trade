# frozen_string_literal: true

class CandleBackfillJob < ApplicationJob
  queue_as :default

  def perform
    BitfinexConfig.symbols.each do |symbol|
      pair = symbol.delete_prefix('t')
      Candle::Fetcher.new(pair, load_all_data: true).call
    end
  end
end
