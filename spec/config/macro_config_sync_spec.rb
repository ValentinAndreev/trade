# frozen_string_literal: true

require 'rails_helper'

RSpec.describe 'MacroConfig and Research::Systems::Schema integration' do
  let(:schema)      { Research::Systems::Schema.data }
  let(:config_keys) { MacroConfig.indicator_keys.sort }

  it 'Schema.data macro_indicators keys match MacroConfig::INDICATORS' do
    dict_keys = schema.fetch('macro_indicators', {}).keys.map(&:to_s).sort
    expect(dict_keys).to eq(config_keys),
      "Schema macro_indicators keys (#{dict_keys}) differ from MacroConfig keys (#{config_keys}). " \
      'Update config/configs/macro_config.rb.'
  end

  it 'Schema.data external_series key enum values match MacroConfig::INDICATORS' do
    enum_values = schema.dig('modules', 'types', 'external_series', 'params', 'key', 'values').map(&:to_s).sort
    expect(enum_values).to eq(config_keys),
      "external_series key values (#{enum_values}) differ from MacroConfig keys (#{config_keys}). " \
      'Update config/configs/macro_config.rb.'
  end

  it 'all coin_metrics formula entries have a corresponding FORMULAS definition' do
    MacroConfig.all_indicators.each do |key, cfg|
      next unless cfg[:source] == 'coin_metrics' && cfg[:formula]

      expect(::Utils::CoinMetricsClient::FORMULAS).to have_key(cfg[:formula].to_s),
        "MacroConfig[:#{key}] references formula '#{cfg[:formula]}' not defined in CoinMetricsClient::FORMULAS"
    end
  end

  it 'all coin_metrics entries have :asset and either :metric or :formula' do
    MacroConfig.all_indicators.each do |key, cfg|
      next unless cfg[:source] == 'coin_metrics'

      expect(cfg[:asset]).to be_present,
        "MacroConfig[:#{key}] is missing :asset"
      expect(cfg[:metric].present? || cfg[:formula].present?).to be(true),
        "MacroConfig[:#{key}] needs :metric or :formula"
    end
  end
end
