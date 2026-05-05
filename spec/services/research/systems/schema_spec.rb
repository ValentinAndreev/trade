# frozen_string_literal: true

require 'rails_helper'

RSpec.describe Research::Systems::Schema do
  before { described_class.reset! }
  after { described_class.reset! }

  describe '.data' do
    it 'exposes native module ML metadata and param defaults' do
      module_def = described_class.data.dig('modules', 'types', 'log_return')

      expect(module_def).to include(
        'module_version' => '1',
        'output_fields' => [ 'value' ],
        'lookahead' => 0,
        'ml_feature_eligible' => true
      )
      expect(module_def.fetch('definition_checksum')).to match(/\A[0-9a-f]{64}\z/)
      expect(module_def.fetch('warmup')).to eq('kind' => 'param', 'param' => 'period', 'default' => 1)
      expect(module_def.dig('params', 'period', 'default')).to eq(1)
    end

    it 'leaves existing technical indicators outside the ML-eligible native set' do
      sma_def = described_class.data.dig('modules', 'types', 'sma')

      expect(sma_def).to include('label' => 'Simple Moving Average')
      expect(sma_def).not_to include('ml_feature_eligible')
      expect(IndicatorsConfig.ml_feature_eligible?(:sma)).to be(false)
    end

    it 'resolves warmup from runtime params' do
      expect(IndicatorsConfig.warmup_for(:vol_regime_score, short_period: 150, long_period: 100)).to eq(150)
    end
  end
end
