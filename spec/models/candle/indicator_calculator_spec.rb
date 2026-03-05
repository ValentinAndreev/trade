# frozen_string_literal: true

require 'rails_helper'

RSpec.describe Candle::IndicatorCalculator do
  let(:candles) do
    50.times.map do |i|
      {
        time: (Time.utc(2026, 1, 1) + i.minutes).to_i,
        open: 100.0 + i, high: 105.0 + i, low: 95.0 + i,
        close: 102.0 + i, volume: 1000.0 + i * 10
      }
    end
  end

  subject(:calculator) { described_class.new(candles) }

  describe '#calculate' do
    it 'computes SMA' do
      result = calculator.calculate(:sma, period: 14)
      expect(result).to be_an(Array)
      expect(result).not_to be_empty
      expect(result.first).to have_key(:sma)
    end

    it 'computes EMA' do
      result = calculator.calculate(:ema, period: 14)
      expect(result).not_to be_empty
      expect(result.first).to have_key(:ema)
    end

    it 'computes RSI' do
      result = calculator.calculate(:rsi, period: 14)
      expect(result).not_to be_empty
      expect(result.first).to have_key(:rsi)
    end

    it 'computes MACD' do
      result = calculator.calculate(:macd)
      expect(result).not_to be_empty
    end

    it 'raises UnknownIndicatorError for invalid indicator' do
      expect { calculator.calculate(:nonexistent) }
        .to raise_error(described_class::UnknownIndicatorError, /Unknown indicator/)
    end

    it 'converts string params to numeric' do
      result = calculator.calculate(:sma, period: '20')
      expect(result).not_to be_empty
    end
  end

  describe '.available' do
    it 'returns list of all indicators' do
      list = described_class.available
      expect(list).to be_an(Array)
      expect(list.map { |i| i[:key] }).to include(:sma, :ema, :rsi, :macd)
    end

    it 'includes required metadata' do
      indicator = described_class.available.find { |i| i[:key] == :sma }
      expect(indicator).to include(:name, :options, :min_data)
    end
  end
end
