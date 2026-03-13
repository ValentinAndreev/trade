# frozen_string_literal: true

class CandleSyncSymbolJob < ApplicationJob
  queue_as :default

  def perform(symbol) = Candle::Fetcher.new(symbol).call
end
