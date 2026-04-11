# frozen_string_literal: true

class CandleBackfillJob < ApplicationJob
  queue_as :default

  def perform
    BitfinexConfig.symbols.each do |symbol|
      Candle::Syncer.new(symbol, load_all_data: true).call
    end
  end
end
