# frozen_string_literal: true

require 'rails_helper'

RSpec.describe Candle do
  describe 'validations' do
    it 'is valid with factory defaults' do
      expect(build(:candle)).to be_valid
    end

    %i[ts symbol exchange timeframe open high low close volume].each do |field|
      it "requires #{field}" do
        candle = build(:candle, field => nil)
        expect(candle).not_to be_valid
      end
    end
  end

  describe 'scopes' do
    before do
      create(:candle, symbol: 'BTCUSD', timeframe: '1m', ts: Time.utc(2026, 1, 1, 12, 0))
      create(:candle, symbol: 'BTCUSD', timeframe: '1m', ts: Time.utc(2026, 1, 1, 12, 1))
      create(:candle, symbol: 'ETHUSD', timeframe: '5m', ts: Time.utc(2026, 1, 1, 12, 0))
    end

    it '.for_symbol filters by symbol' do
      expect(described_class.for_symbol('BTCUSD').count).to eq(2)
      expect(described_class.for_symbol('ETHUSD').count).to eq(1)
    end

    it '.for_timeframe filters by timeframe' do
      expect(described_class.for_timeframe('1m').count).to eq(2)
      expect(described_class.for_timeframe('5m').count).to eq(1)
    end

    it '.in_range filters by time range' do
      from = Time.utc(2026, 1, 1, 12, 0)
      to = Time.utc(2026, 1, 1, 12, 0)
      expect(described_class.in_range(from, to).count).to eq(2) # BTC + ETH at 12:00
    end

    it '.ordered sorts by ts asc' do
      candles = described_class.for_symbol('BTCUSD').ordered
      expect(candles.first.ts).to be < candles.last.ts
    end
  end

  describe '.max_ts' do
    it 'returns the latest timestamp for a symbol' do
      create(:candle, symbol: 'BTCUSD', ts: Time.utc(2026, 1, 1, 10, 0))
      create(:candle, symbol: 'BTCUSD', ts: Time.utc(2026, 1, 1, 12, 0))

      Rails.cache.clear
      expect(described_class.max_ts(symbol: 'BTCUSD')).to eq(Time.utc(2026, 1, 1, 12, 0))
    end

    it 'returns nil when no candles exist' do
      Rails.cache.clear
      expect(described_class.max_ts(symbol: 'NONEXIST')).to be_nil
    end
  end

  describe '.min_ts' do
    it 'returns the earliest timestamp for a symbol' do
      create(:candle, symbol: 'BTCUSD', ts: Time.utc(2026, 1, 1, 10, 0))
      create(:candle, symbol: 'BTCUSD', ts: Time.utc(2026, 1, 1, 12, 0))

      Rails.cache.clear
      expect(described_class.min_ts(symbol: 'BTCUSD')).to eq(Time.utc(2026, 1, 1, 10, 0))
    end
  end

  describe '.import' do
    it 'inserts new records' do
      records = [
        { ts: Time.utc(2026, 1, 1), symbol: 'BTCUSD', exchange: 'bitfinex', timeframe: '1m',
          open: 100, high: 110, low: 90, close: 105, volume: 50 }
      ]

      result = described_class.import(records)
      expect(result.rows.flatten).not_to be_empty
      expect(described_class.count).to eq(1)
    end

    it 'skips duplicates by unique index' do
      ts = Time.utc(2026, 1, 1)
      attrs = { ts: ts, symbol: 'BTCUSD', exchange: 'bitfinex', timeframe: '1m',
                open: 100, high: 110, low: 90, close: 105, volume: 50 }

      described_class.import([ attrs ])
      described_class.import([ attrs ])
      expect(described_class.count).to eq(1)
    end
  end

  describe '#to_ohlcv' do
    it 'returns a hash with numeric values' do
      candle = create(:candle, ts: Time.utc(2026, 1, 1), open: 100.5, high: 110.2, low: 90.1, close: 105.3, volume: 42.7)
      ohlcv = candle.to_ohlcv

      expect(ohlcv[:time]).to eq(Time.utc(2026, 1, 1).to_i)
      expect(ohlcv[:open]).to be_a(Float)
      expect(ohlcv[:close]).to eq(105.3)
    end
  end
end
