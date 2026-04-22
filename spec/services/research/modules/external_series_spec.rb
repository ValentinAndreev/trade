# frozen_string_literal: true

require 'rails_helper'

RSpec.describe Research::Modules::ExternalSeries do
  let(:start_time) { Time.utc(2026, 1, 1, 0, 0) }
  let(:candles) do
    Array.new(4) do |index|
      {
        time: (start_time + index.days).to_i,
        open: 100.0 + index,
        high: 101.0 + index,
        low: 99.0 + index,
        close: 100.5 + index,
        volume: 10.0
      }
    end
  end

  describe '#call' do
    it 'aligns external values to candle times using backward-only lookup' do
      create(:macro_series, source: 'coin_metrics', indicator: 'mvrv_ratio', ts: start_time - 1.day, value: 0.8)
      create(:macro_series, source: 'coin_metrics', indicator: 'mvrv_ratio', ts: start_time + 2.days, value: 1.2)

      result = described_class.new(candles:).call(key: 'mvrv_ratio')

      expect(result.map { |point| point[:time] }).to eq(candles.map { |candle| candle[:time] })
      expect(result.map { |point| point.dig(:result, :value) }).to eq([ 0.8, 0.8, 1.2, 1.2 ])
    end

    it 'uses the source from Macro::Catalog and ignores records from other providers' do
      create(:macro_series, source: 'coin_metrics', indicator: 'mvrv_ratio', ts: start_time - 1.day, value: 0.8)
      create(:macro_series, source: 'other_provider', indicator: 'mvrv_ratio', ts: start_time - 1.day, value: 9.9)

      result = described_class.new(candles:).call(key: 'mvrv_ratio')

      expect(result.map { |point| point.dig(:result, :value) }).to eq([ 0.8, 0.8, 0.8, 0.8 ])
    end
  end
end
