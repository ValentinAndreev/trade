# frozen_string_literal: true

require 'rails_helper'

RSpec.describe Research::RunRequest do
  let(:yaml_system) do
    <<~YAML
      id: rsi_threshold
      name: RSI Threshold Reversal
      modules:
        rsi:
          type: rsi
          period: 14
      params:
        position_mode: long_short
        lower_threshold: 30
        upper_threshold: 70
      conditions:
        long_entry: "rsi.value << params.lower_threshold"
        long_exit: "rsi.value >> params.upper_threshold"
        short_entry: "rsi.value >> params.upper_threshold"
        short_exit: "rsi.value << params.lower_threshold"
      optimization:
        targets:
          - rsi.period
          - params.lower_threshold
    YAML
  end

  let(:dsl_params) do
    {
      symbol: 'BTCUSD',
      timeframe: '1h',
      start_time: '2026-01-01T00:00:00Z',
      end_time: '2026-02-01T00:00:00Z',
      system_id: 'rsi_threshold',
      system_yaml: yaml_system,
      execution: {
        fee_bps: 4,
        slippage_bps: 2
      },
      optimization: {
        enabled: true,
        target: 'params.lower_threshold',
        from: 25,
        to: 35,
        step: 5
      }
    }
  end

  describe '#runtime_params' do
    it 'builds runtime params from yaml dsl' do
      request = described_class.new(dsl_params)

      expect(request.system).to be_a(Research::Systems::Definition)
      expect(request.runtime_params).to eq({
        rsi_period: 14.0,
        position_mode: 'long_short',
        lower_threshold: 30.0,
        upper_threshold: 70.0
      })
    end
  end

  describe '#response_payload' do
    it 'formats yaml metadata through the compiled system' do
      request = described_class.new(dsl_params)

      payload = request.response_payload(runs: [ { params: { rsi_period: 14 }, trades: [] } ])

      expect(payload[:strategy]).to eq('rsi_threshold')
      expect(payload.dig(:system, :id)).to eq('rsi_threshold')
      expect(payload.dig(:system, :name)).to eq('RSI Threshold Reversal')
      expect(payload.dig(:modules, 'rsi', 'type')).to eq('rsi')
      expect(payload.dig(:modules, 'rsi', 'period')).to eq(14)
      expect(payload.dig(:optimization, :param)).to eq('params.lower_threshold')
    end
  end
end
