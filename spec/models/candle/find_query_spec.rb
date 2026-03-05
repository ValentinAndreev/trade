# frozen_string_literal: true

require 'rails_helper'

RSpec.describe Candle::FindQuery do
  describe '#call' do
    before do
      Rails.cache.clear
      10.times do |i|
        create(:candle, symbol: 'BTCUSD', timeframe: '1m',
               ts: Time.utc(2026, 1, 1, 12, 0) + i.minutes,
               open: 50_000 + i, high: 50_100 + i, low: 49_900 + i,
               close: 50_050 + i, volume: 10.0 + i)
      end
    end

    it 'returns OHLCV data for 1m timeframe' do
      result = described_class.new(
        symbol: 'BTCUSD',
        timeframe: '1m',
        start_time: Time.utc(2026, 1, 1, 12, 0),
        end_time: Time.utc(2026, 1, 1, 12, 9)
      ).call

      expect(result).to be_an(Array)
      expect(result.length).to eq(10)
      expect(result.first).to include(:time, :open, :high, :low, :close, :volume)
    end

    it 'returns floats for all price fields' do
      result = described_class.new(
        symbol: 'BTCUSD', timeframe: '1m',
        start_time: Time.utc(2026, 1, 1, 12, 0),
        end_time: Time.utc(2026, 1, 1, 12, 0)
      ).call

      candle = result.first
      %i[open high low close volume].each do |field|
        expect(candle[field]).to be_a(Float)
      end
    end

    it 'returns empty array when no data' do
      result = described_class.new(symbol: 'NONEXIST', timeframe: '1m').call
      expect(result).to eq([])
    end

    it 'respects time range' do
      result = described_class.new(
        symbol: 'BTCUSD', timeframe: '1m',
        start_time: Time.utc(2026, 1, 1, 12, 3),
        end_time: Time.utc(2026, 1, 1, 12, 5)
      ).call

      expect(result.length).to eq(3)
    end

    it 'raises ArgumentError for invalid timeframe' do
      expect {
        described_class.new(
          symbol: 'BTCUSD', timeframe: 'invalid',
          start_time: Time.utc(2026, 1, 1, 12, 0),
          end_time: Time.utc(2026, 1, 1, 12, 9)
        ).call
      }.to raise_error(ArgumentError, /Invalid timeframe/)
    end

    context 'with continuous aggregates', :timescale do
      it 'reads from aggregate view for 5m timeframe' do
        result = described_class.new(
          symbol: 'BTCUSD', timeframe: '5m',
          start_time: Time.utc(2026, 1, 1, 12, 0),
          end_time: Time.utc(2026, 1, 1, 12, 9)
        ).call
        expect(result).to be_an(Array)
      end
    end
  end
end
