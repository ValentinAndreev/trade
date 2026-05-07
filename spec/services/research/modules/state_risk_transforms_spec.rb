# frozen_string_literal: true

require 'rails_helper'

RSpec.describe 'state/risk transform modules' do
  let(:start_time) { Time.utc(2026, 1, 1) }
  let(:closes) { [ 100.0, 101.0, 103.0, 102.0, 106.0, 110.0 ] }
  let(:candles) do
    closes.each_with_index.map do |close, index|
      {
        time: (start_time + index.minutes).to_i,
        open: close - 1.0,
        high: close + 2.0,
        low: close - 2.0,
        close:,
        volume: 1_000.0 + index
      }
    end
  end

  it 'computes lag, delta and rolling mean from trailing current-series values' do
    lag = Research::Modules::Lag.new(candles:).call(period: 2)
    delta = Research::Modules::Delta.new(candles:).call(period: 2)
    mean = Research::Modules::RollingMean.new(candles:).call(period: 3)

    expect(lag[1].dig(:result, :value)).to be_nil
    expect(lag[2].dig(:result, :value)).to eq(100.0)
    expect(delta[2].dig(:result, :value)).to eq(3.0)
    expect(mean[2].dig(:result, :value)).to eq((100.0 + 101.0 + 103.0) / 3.0)
  end

  it 'computes smoothing, clipping, winsorization and scale transforms' do
    std = Research::Modules::RollingStd.new(candles:).call(period: 3)
    ema = Research::Modules::EmaSmoother.new(candles:).call(period: 3)
    clip = Research::Modules::Clip.new(candles:).call(min_value: 101, max_value: 105)
    winsorized = Research::Modules::Winsorize.new(candles:).call(period: 3, lower_quantile: 0.25, upper_quantile: 0.75)
    zscore = Research::Modules::Zscore.new(candles:).call(period: 3)
    robust = Research::Modules::RobustZscore.new(candles:).call(period: 3)
    minmax = Research::Modules::MinmaxPosition.new(candles:).call(period: 3)

    expect(std[2].dig(:result, :value)).to be_within(0.000001).of(1.247219)
    expect(ema[2].dig(:result, :value)).to eq(101.75)
    expect(clip[0].dig(:result, :value)).to eq(101.0)
    expect(clip[5].dig(:result, :value)).to eq(105.0)
    expect(winsorized[2].dig(:result, :value)).to eq(102.0)
    expect(zscore[2].dig(:result, :value)).to be_within(0.000001).of(1.336306)
    expect(robust[2].dig(:result, :value)).to be_within(0.000001).of(1.348982)
    expect(minmax[2].dig(:result, :value)).to eq(1.0)
  end

  it 'uses earlier module outputs as same-series inputs in research runtime order' do
    basis = Research::Modules::RollingMean.new(candles:).call(period: 2).map { |point| point.fetch(:result) }
    result = Research::Modules::Delta.new(candles:).call(
      input: { 'kind' => 'module', 'module_ref' => 'basis', 'output' => 'value' },
      period: 1,
      module_series: { basis: }
    )

    expect(result[2].dig(:result, :value)).to eq(1.5)
  end

  it 'registers transform metadata in the shared Research schema and LLM docs' do
    schema = Research::Systems::Schema.data.dig('modules', 'types')
    docs = Llm::SystemEditor::KnowledgeBase.modules

    expect(schema.fetch('robust_zscore')).to include(
      'output_fields' => [ 'value' ],
      'lookahead' => 0,
      'ml_feature_eligible' => true
    )
    expect(docs.dig('winsorize', 'params', 'input', 'type')).to eq('input_ref')
  end
end
