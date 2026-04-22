# frozen_string_literal: true

require 'rails_helper'

RSpec.describe 'IndicatorsConfig and Research::Systems::Schema integration' do
  let(:schema)         { Research::Systems::Schema.data }
  let(:config_keys)    { IndicatorsConfig.indicator_keys.sort }

  it 'Schema.data modules.types keys match IndicatorsConfig::INDICATORS' do
    schema_keys = schema.dig('modules', 'types').keys.map(&:to_s).sort
    expect(schema_keys).to eq(config_keys),
      "Schema modules.types keys (#{schema_keys}) differ from IndicatorsConfig keys (#{config_keys}). " \
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
end
