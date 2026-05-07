# frozen_string_literal: true

require 'rails_helper'

RSpec.describe Research::Modules::InputResolver do
  let(:start_time) { Time.utc(2026, 1, 1) }
  let(:candles) do
    [ 100.0, 101.0, 103.0 ].map.with_index do |close, index|
      {
        time: (start_time + index.hours).to_i,
        open: close - 1.0,
        high: close + 2.0,
        low: close - 2.0,
        close:,
        volume: 1_000.0 + index
      }
    end
  end

  it 'resolves OHLCV input values from the current candle series' do
    values = described_class.new(candles:).values({ 'kind' => 'ohlcv', 'field' => 'open' })

    expect(values).to eq([ 99.0, 100.0, 102.0 ])
  end

  it 'resolves earlier module output values by module reference and output field' do
    resolver = described_class.new(
      candles:,
      module_series: {
        basis: [
          { value: 1.0, other: 2.0 },
          { value: 1.5, other: 2.5 },
          { value: 2.0, other: 3.0 }
        ]
      }
    )

    values = resolver.values({ 'kind' => 'module', 'module_ref' => 'basis', 'output' => 'other' })

    expect(values).to eq([ 2.0, 2.5, 3.0 ])
  end

  it 'aligns external series by last known timestamp at or before the candle timestamp' do
    create(:macro_series, indicator: 'vix', source: 'yahoo', ts: start_time + 1.hour, value: 18.5)
    create(:macro_series, indicator: 'vix', source: 'yahoo', ts: start_time + 3.hours, value: 21.0)

    values = described_class.new(candles:).values({ 'kind' => 'external_series', 'key' => 'vix', 'output' => 'value' })

    expect(values).to eq([ nil, 18.5, 18.5 ])
  end

  it 'returns an empty external series for empty candle inputs' do
    values = described_class.new(candles: []).values({ 'kind' => 'external_series', 'key' => 'vix', 'output' => 'value' })

    expect(values).to eq([])
  end
end
