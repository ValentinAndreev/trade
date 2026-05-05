# frozen_string_literal: true

require 'rails_helper'

RSpec.describe 'IndicatorsConfig and Research::Systems::Schema integration' do
  let(:schema)         { Research::Systems::Schema.data }
  let(:config_keys)    { IndicatorsConfig.indicator_keys.sort }

  it 'Schema.data modules.types keys match IndicatorsConfig::INDICATORS plus static modules' do
    schema_keys = schema.dig('modules', 'types').keys.map(&:to_s).sort
    expected_keys = (config_keys + [ 'ml_signal' ]).sort
    expect(schema_keys).to eq(expected_keys),
      "Schema modules.types keys (#{schema_keys}) differ from expected schema keys (#{expected_keys}). " \
      'Update config/configs/indicators_config.rb.'
  end

  it 'every indicator param has a type and label' do
    schema.dig('modules', 'types').each do |type, defn|
      (defn['params'] || {}).each do |param_key, rule|
        expect(rule['type']).to be_present,
          "#{type}.#{param_key} is missing 'type'"
        expect(rule['label']).to be_present,
          "#{type}.#{param_key} is missing 'label'"
      end
    end
  end

  it 'IndicatorsConfig keys (minus external_series) match Candle::IndicatorCalculator::INDICATORS' do
    config_keys     = IndicatorsConfig.indicator_keys - [ 'external_series' ]
    calculator_keys = Candle::IndicatorCalculator::INDICATORS.keys.map(&:to_s)

    expect(config_keys.sort).to eq(calculator_keys.sort),
      'Mismatch between IndicatorsConfig and IndicatorCalculator. ' \
      "Only in IndicatorsConfig: #{(config_keys - calculator_keys).join(', ')}. " \
      "Only in IndicatorCalculator: #{(calculator_keys - config_keys).join(', ')}."
  end

  it 'includes native heuristic text in feature definition checksums' do
    first = IndicatorsConfig.native_indicator(
      label: 'Heuristic A',
      params: {},
      warmup: { kind: 'fixed', value: 1 },
      description: 'test',
      formula: 'same',
      heuristic: 'version-a'
    )
    second = IndicatorsConfig.native_indicator(
      label: 'Heuristic B',
      params: {},
      warmup: { kind: 'fixed', value: 1 },
      description: 'test',
      formula: 'same',
      heuristic: 'version-b'
    )

    expect(first.fetch(:definition_checksum)).not_to eq(second.fetch(:definition_checksum))
  end

  it 'uses period-minus-one warmup for trailing window position modules' do
    expect(IndicatorsConfig.warmup_for(:range_position, period: 2)).to eq(1)
    expect(IndicatorsConfig.warmup_for(:rolling_zscore, period: 2)).to eq(1)
    expect(IndicatorsConfig.warmup_for(:percentile_rank, period: 2)).to eq(1)
  end

  it 'resolves nested warmup rules inside max-param rules' do
    rule = IndicatorsConfig.max_param_warmup(
      IndicatorsConfig.param_warmup_minus_one(:short_period, default: 20),
      IndicatorsConfig.param_warmup(:long_period, default: 100)
    )

    indicator = IndicatorsConfig.native_indicator(
      label: 'Nested Warmup',
      params: {},
      warmup: rule,
      description: 'test',
      formula: 'test',
      heuristic: 'test'
    )
    stub_const('IndicatorsConfig::INDICATORS', IndicatorsConfig::INDICATORS.merge(nested_warmup_test: indicator))

    expect(IndicatorsConfig.warmup_for(:nested_warmup_test, short_period: 5, long_period: 3)).to eq(4)
  end
end
