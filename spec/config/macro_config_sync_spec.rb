# frozen_string_literal: true

require 'rails_helper'

RSpec.describe 'MacroConfig and dictionary.yml sync' do
  let(:dictionary) { Research::Systems::Schema.data }
  let(:dict_keys)  { dictionary.fetch('macro_indicators', {}).keys.map(&:to_s).sort }
  let(:config_keys) { MacroConfig.indicator_keys.sort }

  it 'macro_indicators in dictionary.yml matches MacroConfig::INDICATORS keys' do
    expect(dict_keys).to eq(config_keys),
      "dictionary.yml macro_indicators keys (#{dict_keys}) differ from MacroConfig keys (#{config_keys}). " \
      'Update config/research/dictionary.yml to match config/configs/macro_config.rb.'
  end

  it 'dictionary.yml references fields include all macro indicator keys' do
    ref_fields = dictionary.dig('references', 'fields').map(&:to_s)
    missing = config_keys - ref_fields
    expect(missing).to be_empty,
      "references.fields in dictionary.yml missing: #{missing}. Add them when adding a new macro indicator."
  end
end
