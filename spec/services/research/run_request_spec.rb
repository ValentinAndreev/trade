# frozen_string_literal: true

require 'rails_helper'

RSpec.describe Research::RunRequest do
  let(:params) do
    {
      symbol: 'BTCUSD',
      timeframe: '1h',
      start_time: '2026-01-01T00:00:00Z',
      end_time: '2026-02-01T00:00:00Z',
      system: {
        type: 'oscillator_threshold',
        params: {
          position_mode: 'long_short',
          lower_threshold: 30,
          upper_threshold: 70
        }
      },
      module: {
        type: 'rsi',
        params: {
          period: 14
        }
      },
      execution: {
        fee_bps: 4,
        slippage_bps: 2
      },
      optimization: {
        enabled: true,
        target: 'system.lower_threshold',
        from: 25,
        to: 35,
        step: 5
      }
    }
  end

  describe '#runtime_params' do
    it 'builds normalized runtime params through the resolved system object' do
      request = described_class.new(params)

      expect(request.system).to be_a(Research::Systems::OscillatorThreshold)
      expect(request.runtime_params).to eq({
        module_period: 14,
        position_mode: 'long_short',
        lower_threshold: 30.0,
        upper_threshold: 70.0
      })
    end
  end

  describe '#response_payload' do
    it 'formats response metadata without controller-specific logic' do
      request = described_class.new(params)

      payload = request.response_payload(runs: [ { params: { module_period: 14 }, trades: [] } ])

      expect(payload[:strategy]).to eq('rsi_threshold')
      expect(payload.dig(:system, :type)).to eq('oscillator_threshold')
      expect(payload.dig(:module, :type)).to eq('rsi')
      expect(payload.dig(:optimization, :param)).to eq('system.lower_threshold')
    end
  end
end
