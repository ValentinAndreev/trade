# frozen_string_literal: true

class CandleSyncSymbolJob < ApplicationJob
  queue_as :default

  def perform(symbol) = Candle::Syncer.new(symbol).call
end
