# frozen_string_literal: true

require 'rails_helper'

RSpec.describe Research::SystemRegistry do
  describe '.fetch' do
    it 'resolves price module cross + ema' do
      system = described_class.fetch(system_type: 'price_module_cross', module_type: 'ema')

      expect(system).to be_a(Research::Systems::PriceModuleCross)
      expect(system.strategy_key).to eq('ema_cross')
      expect(system.optimization_param_key('module.period')).to eq(:module_period)
    end

    it 'resolves oscillator threshold + rsi' do
      system = described_class.fetch(system_type: 'oscillator_threshold', module_type: 'rsi')

      expect(system).to be_a(Research::Systems::OscillatorThreshold)
      expect(system.strategy_key).to eq('rsi_threshold')
      expect(system.optimization_param_key('system.lower_threshold')).to eq(:lower_threshold)
    end
  end
end
