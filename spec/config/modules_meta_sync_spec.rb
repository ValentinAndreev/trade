# frozen_string_literal: true

require 'rails_helper'

RSpec.describe 'modules_meta.yml coverage' do
  let(:meta) { Llm::PromptLibrary.load_yaml('llm/system_editor/modules_meta.yml') }

  it 'has an entry for every IndicatorsConfig key' do
    missing = IndicatorsConfig.indicator_keys.reject { |k| meta.key?(k) }
    expect(missing).to be_empty,
      "modules_meta.yml is missing entries for: #{missing.join(', ')}. " \
      'Add descriptions to app/prompts/llm/system_editor/modules_meta.yml.'
  end

  it 'has a macro_indicators entry for every MacroConfig indicator' do
    macro_meta = meta.fetch('macro_indicators', {})
    missing = MacroConfig.indicator_keys.reject { |k| macro_meta.key?(k) }
    expect(missing).to be_empty,
      "modules_meta.yml macro_indicators is missing entries for: #{missing.join(', ')}."
  end
end
