# frozen_string_literal: true

require 'rails_helper'

RSpec.describe 'native state/risk normalization modules' do
  let(:start_time) { Time.utc(2026, 1, 1) }
  let(:closes) { [ 100.0, 101.0, 103.0, 102.0, 104.0, 108.0, 107.0, 110.0 ] }
  let(:candles) do
    closes.each_with_index.map do |close, index|
      {
        time: (start_time + index.minutes).to_i,
        open: close - 0.5,
        high: close + 2.0,
        low: close - 2.0,
        close:,
        volume: 1_000.0 + index
      }
    end
  end

  it 'resolves explicit native constants without falling back to TechnicalAnalysis' do
    expect(TechnicalAnalysis).not_to receive(:const_defined?)

    expect(Research::Modules.for(:log_return)).to eq(Research::Modules::LogReturn)
  end

  it 'keeps technical-analysis modules on the existing Base proxy path' do
    module_class = Research::Modules.for(:sma)

    expect(module_class.superclass).to eq(Research::Modules::Base)
    expect(module_class.new(candles:).call(period: 2).first[:result]).to have_key(:value)
  end

  it 'returns candle-aligned research points with nil values during warmup' do
    result = Research::Modules::LogReturn.new(candles:).call(period: 2)

    expect(result.map { |point| point[:time] }).to eq(candles.map { |candle| candle[:time] })
    expect(result[0].dig(:result, :value)).to be_nil
    expect(result[1].dig(:result, :value)).to be_nil
    expect(result[2].dig(:result, :value)).to be_within(0.000001).of(Math.log(103.0 / 100.0))
  end

  it 'computes rolling price normalization modules from past and current candles' do
    zscore = Research::Modules::RollingZscore.new(candles:).call(period: 2)
    percentile = Research::Modules::PercentileRank.new(candles:).call(period: 2)
    range = Research::Modules::RangePosition.new(candles:).call(period: 2)

    expect(zscore[2].dig(:result, :value)).to be_within(0.000001).of(1.0)
    expect(percentile[2].dig(:result, :value)).to eq(1.0)
    expect(range[2].dig(:result, :value)).to be_between(0.0, 1.0).inclusive
  end

  it 'computes bounded trend and volatility regime scores' do
    trend = Research::Modules::TrendRegimeScore.new(candles:).call(period: 2)
    volatility_regime = Research::Modules::VolRegimeScore.new(candles:).call(short_period: 2, long_period: 3)

    expect(trend[2].dig(:result, :value)).to be_between(-1.0, 1.0).inclusive
    expect(volatility_regime[3].dig(:result, :value)).to be_between(0.0, 1.0).inclusive
  end

  it 'computes volatility-adjusted fields with validated native params' do
    result = Research::Modules::VolAdjust.new(candles:).call(period: '2', field: 'volume', epsilon: '0.01')

    expect(result[2].dig(:result, :value)).to be_present
    expect { Research::Modules::VolAdjust.new(candles:).call(period: 2, field: 'unknown') }
      .to raise_error(ArgumentError, /field must be one of/)
  end
end
