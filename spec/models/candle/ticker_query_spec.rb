# frozen_string_literal: true

require 'rails_helper'

RSpec.describe Candle::TickerQuery do
  let(:client) { instance_double(Utils::BitfinexClient) }

  before do
    allow(Utils::BitfinexClient).to receive(:new).and_return(client)
    Rails.cache.clear
  end

  describe '#call with live Bitfinex tickers' do
    it 'uses live data from Bitfinex tickers API' do
      create(:candle, symbol: 'BTCUSD', ts: 1.hour.ago, close: 49_000)

      allow(client).to receive(:tickers).and_return([
        ['tBTCUSD', 50_000, 1, 50_010, 1, 1000.0, 0.02, 50_005.0, 500.0, 51_000.0, 49_000.0]
      ])

      tickers = described_class.new(%w[BTCUSD]).call
      ticker = tickers.first

      expect(ticker[:symbol]).to eq('BTCUSD')
      expect(ticker[:last_price]).to eq(50_005.0)
      expect(ticker[:change_24h]).to eq(1000.0)
      expect(ticker[:change_24h_perc]).to eq(0.02)
      expect(ticker[:volume]).to eq(500.0)
      expect(ticker[:sparkline]).to be_an(Array)
    end

    it 'caches the Bitfinex response' do
      create(:candle, symbol: 'BTCUSD', ts: 1.hour.ago, close: 49_000)

      allow(client).to receive(:tickers).and_return([
        ['tBTCUSD', 0, 0, 0, 0, 100.0, 0.01, 50_000.0, 300.0, 51_000.0, 49_000.0]
      ])

      original_cache = Rails.cache
      Rails.cache = ActiveSupport::Cache::MemoryStore.new
      begin
        2.times { described_class.new(%w[BTCUSD]).call }
        expect(client).to have_received(:tickers).once
      ensure
        Rails.cache = original_cache
      end
    end
  end

  describe '#call with DB fallback' do
    before do
      allow(client).to receive(:tickers).and_raise(Utils::BitfinexClient::ApiError, 'API down')
    end

    it 'returns empty array for unknown symbols' do
      expect(described_class.new(%w[NONEXIST]).call).to eq([])
    end

    it 'builds ticker data from candles when API unavailable' do
      now = Time.utc(2026, 3, 1, 12, 0)
      create(:candle, symbol: 'BTCUSD', ts: now - 12.hours, close: 49_500)
      create(:candle, symbol: 'BTCUSD', ts: now, close: 50_000, high: 51_000, low: 48_000, volume: 100)

      tickers = described_class.new(%w[BTCUSD]).call
      ticker = tickers.first

      expect(ticker[:symbol]).to eq('BTCUSD')
      expect(ticker[:last_price]).to eq(50_000.0)
      expect(ticker[:sparkline]).to be_an(Array)
      expect(ticker[:updated_at]).to be_present
    end

    it 'calculates 24h change from DB' do
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
