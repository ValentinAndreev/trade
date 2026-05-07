# frozen_string_literal: true

require 'rails_helper'

RSpec.describe 'pair/proxy state-risk modules' do
  let(:start_time) { Time.utc(2026, 1, 1) }
  let(:candles) do
    [ 100.0, 102.0, 104.0, 103.0, 107.0, 111.0 ].map.with_index do |close, index|
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

  it 'computes spread, ratio and rolling correlation over aligned inputs' do
    left = { 'kind' => 'ohlcv', 'field' => 'close' }
    right = { 'kind' => 'ohlcv', 'field' => 'open' }

    spread = Research::Modules::Spread.new(candles:).call(left:, right:)
    ratio = Research::Modules::Ratio.new(candles:).call(left:, right:)
    corr = Research::Modules::RollingCorr.new(candles:).call(left:, right:, period: 3)

    expect(spread.map { |point| point.dig(:result, :value) }).to all(eq(1.0))
    expect(ratio[0].dig(:result, :value)).to be_within(0.000001).of(100.0 / 99.0)
    expect(corr[2].dig(:result, :value)).to be_within(0.000001).of(1.0)
  end

  it 'aligns sparse external-series pair inputs without future leakage and uses <= at exact timestamp' do
    create(:macro_series, indicator: 'vix', source: 'yahoo', ts: start_time + 1.hour, value: 20.0)
    create(:macro_series, indicator: 'vix', source: 'yahoo', ts: start_time + 3.hours, value: 25.0)

    result = Research::Modules::Spread.new(candles:).call(
      left: { 'kind' => 'external_series', 'key' => 'vix', 'output' => 'value' },
      right: { 'kind' => 'ohlcv', 'field' => 'open' }
    )

    expect(result[0].dig(:result, :value)).to be_nil
    expect(result[1].dig(:result, :value)).to eq(20.0 - 101.0)
    expect(result[2].dig(:result, :value)).to eq(20.0 - 103.0)
    expect(result[3].dig(:result, :value)).to eq(25.0 - 102.0)
  end

  it 'computes bounded proxy heuristics and documents that they are not statistical tests' do
    stationarity = Research::Modules::StationarityProxy.new(candles:).call(period: 2)
    heteroskedasticity = Research::Modules::HeteroskedasticityProxy.new(candles:).call(period: 2)
    schema = Research::Systems::Schema.data.dig('modules', 'types')

    expect(stationarity[3].dig(:result, :value)).to be_between(0.0, 1.0).inclusive
    expect(heteroskedasticity[3].dig(:result, :value)).to be_between(0.0, 1.0).inclusive
    expect(schema.dig('stationarity_proxy', 'description')).to include('not an ADF or KPSS')
    expect(schema.dig('heteroskedasticity_proxy', 'description')).to include('not a Levene or Breusch-Pagan')
  end
end
