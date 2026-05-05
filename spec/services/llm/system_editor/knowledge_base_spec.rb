# frozen_string_literal: true

require 'rails_helper'

RSpec.describe Llm::SystemEditor::KnowledgeBase do
  before { Research::Systems::Schema.reset! }
  after { Research::Systems::Schema.reset! }

  describe '.modules' do
    it 'includes native module metadata from the research schema' do
      log_return = described_class.modules.fetch('log_return')

      expect(log_return).to include(
        'module_version' => '1',
        'output_fields' => [ 'value' ],
        'lookahead' => 0,
        'ml_feature_eligible' => true
      )
      expect(log_return.fetch('definition_checksum')).to match(/\A[0-9a-f]{64}\z/)
      expect(log_return.fetch('warmup')).to eq('kind' => 'param', 'param' => 'period', 'default' => 1)
      expect(log_return.dig('params', 'period', 'default')).to eq(1)
      expect(log_return.fetch('formula')).to include('close[t]')
    end

    it 'does not mark TA-backed modules as ML-eligible' do
      sma = described_class.modules.fetch('sma')

      expect(sma).not_to include('ml_feature_eligible')
      expect(sma).not_to include('definition_checksum')
    end
  end
end
