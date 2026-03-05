# frozen_string_literal: true

require 'rails_helper'

RSpec.describe Candle::TickerQuery do
  describe '#call' do
    it 'returns empty array for unknown symbols' do
      expect(described_class.new(%w[NONEXIST]).call).to eq([])
    end

    it 'builds ticker data from candles' do
      now = Time.utc(2026, 3, 1, 12, 0)

      create(:candle, symbol: 'BTCUSD', ts: now - 25.hours, close: 49_000)
      create(:candle, symbol: 'BTCUSD', ts: now - 12.hours, close: 49_500)
      create(:candle, symbol: 'BTCUSD', ts: now, close: 50_000, high: 51_000, low: 48_000, volume: 100)

      tickers = described_class.new(%w[BTCUSD]).call
      expect(tickers.length).to eq(1)

      ticker = tickers.first
      expect(ticker[:symbol]).to eq('BTCUSD')
      expect(ticker[:last_price]).to eq(50_000.0)
      expect(ticker[:sparkline]).to be_an(Array)
      expect(ticker[:updated_at]).to be_present
    end

    it 'calculates 24h change' do
      now = Time.utc(2026, 3, 1, 12, 0)
      create(:candle, symbol: 'BTCUSD', ts: now - 23.hours, close: 40_000)
      create(:candle, symbol: 'BTCUSD', ts: now, close: 44_000)

      ticker = described_class.new(%w[BTCUSD]).call.first
      expect(ticker[:change_24h]).to eq(4_000.0)
      expect(ticker[:change_24h_perc]).to eq(0.1)
    end

    it 'samples sparkline to 48 points max' do
      now = Time.utc(2026, 3, 1, 12, 0)
      100.times do |i|
        create(:candle, symbol: 'BTCUSD', ts: now - (100 - i).minutes, close: 50_000 + i)
      end

      ticker = described_class.new(%w[BTCUSD]).call.first
      expect(ticker[:sparkline].length).to be <= Candle::TickerQuery::SPARKLINE_POINTS
    end

    it 'skips symbols without candles' do
      create(:candle, symbol: 'BTCUSD', ts: Time.utc(2026, 1, 1), close: 50_000)
      tickers = described_class.new(%w[BTCUSD NONEXIST]).call
      expect(tickers.map { |t| t[:symbol] }).to eq(%w[BTCUSD])
    end
  end
end
