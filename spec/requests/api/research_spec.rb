# frozen_string_literal: true

require 'rails_helper'

RSpec.describe 'Api::Research' do
  let(:start_time) { Time.utc(2026, 1, 1, 12, 0) }
  let(:end_time) { start_time + 15.minutes }
  let(:close_values) { [ 100, 101, 102, 101, 99, 97, 98, 100, 103, 104, 102, 99, 96, 97, 100, 104 ] }

  before do
    Rails.cache.clear

    close_values.each_with_index do |close, index|
      ts = start_time + index.minutes
      create(
        :candle,
        symbol: 'BTCUSD',
        exchange: 'bitfinex',
        timeframe: '1m',
        ts: ts,
        open: close - 0.5,
        high: close + 1.0,
        low: close - 1.0,
        close: close.to_f,
        volume: 10.0 + index
      )
    end
  end

  describe 'POST /api/research/run' do
    it 'runs a single ema cross server-side research execution' do
      post '/api/research/run', params: {
        symbol: 'BTCUSD',
        timeframe: '1m',
        start_time: start_time.iso8601,
        end_time: end_time.iso8601,
        system: { type: 'price_module_cross', params: { position_mode: 'long_short' } },
        module: { type: 'ema', params: { period: 3 } },
        execution: { fee_bps: 4, slippage_bps: 2 },
        optimization: { enabled: false }
      }, as: :json

      expect(response).to have_http_status(:ok)

      json = response.parsed_body
      expect(json['strategy']).to eq('ema_cross')
      expect(json.dig('system', 'type')).to eq('price_module_cross')
      expect(json.dig('module', 'type')).to eq('ema')
      expect(json['runs']).to be_an(Array)
      expect(json['runs'].length).to eq(1)
      expect(json['runs'].first['params']).to eq({
        'system_type' => 'price_module_cross',
        'module_type' => 'ema',
        'module_period' => 3,
        'position_mode' => 'long_short'
      })
      expect(json['runs'].first['trades']).to be_an(Array)
    end

    it 'runs optimization over module period and returns every ema run' do
      post '/api/research/run', params: {
        symbol: 'BTCUSD',
        timeframe: '1m',
        start_time: start_time.iso8601,
        end_time: end_time.iso8601,
        system: { type: 'price_module_cross', params: { position_mode: 'long_short' } },
        module: { type: 'ema', params: { period: 3 } },
        execution: { fee_bps: 4, slippage_bps: 2 },
        optimization: { enabled: true, target: 'module.period', from: 3, to: 7, step: 2 }
      }, as: :json

      expect(response).to have_http_status(:ok)

      json = response.parsed_body
      expect(json.dig('optimization', 'enabled')).to eq(true)
      expect(json.dig('optimization', 'param')).to eq('module.period')
      expect(json['runs'].length).to eq(3)
      expect(json['runs'].map { |run| run.dig('params', 'module_period') }).to eq([ 3, 5, 7 ])
    end

    it 'runs RSI threshold research and can optimize lower threshold' do
      post '/api/research/run', params: {
        symbol: 'BTCUSD',
        timeframe: '1m',
        start_time: start_time.iso8601,
        end_time: end_time.iso8601,
        system: {
          type: 'oscillator_threshold',
          params: { position_mode: 'long_short', lower_threshold: 35, upper_threshold: 65 }
        },
        module: { type: 'rsi', params: { period: 3 } },
        execution: { fee_bps: 4, slippage_bps: 2 },
        optimization: { enabled: true, target: 'system.lower_threshold', from: 30, to: 40, step: 5 }
      }, as: :json

      expect(response).to have_http_status(:ok)

      json = response.parsed_body
      expect(json['strategy']).to eq('rsi_threshold')
      expect(json.dig('system', 'type')).to eq('oscillator_threshold')
      expect(json.dig('module', 'type')).to eq('rsi')
      expect(json.dig('optimization', 'param')).to eq('system.lower_threshold')
      expect(json['runs'].map { |run| run.dig('params', 'lower_threshold') }).to eq([ 30.0, 35.0, 40.0 ])
    end
  end
end
