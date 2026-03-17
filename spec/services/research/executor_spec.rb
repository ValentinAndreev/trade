# frozen_string_literal: true

require 'rails_helper'

RSpec.describe Research::Executor do
  let(:start_time)  { Time.utc(2026, 1, 1, 12, 0) }
  let(:end_time)    { start_time + 15.minutes }
  let(:close_values) { [ 100, 101, 102, 101, 99, 97, 98, 100, 103, 104, 102, 99, 96, 97, 100, 104 ] }

  let(:ema_system) do
    entry = Research::Dsl::Catalog.find('price_ema_cross2')
    raise 'ema system not found' unless entry

    Research::Dsl::Catalog.validate(entry.yaml).raise_if_invalid!.compiled
  end

  let(:rsi_system) do
    entry = Research::Dsl::Catalog.find('rsi_threshold')
    raise 'rsi system not found' unless entry

    Research::Dsl::Catalog.validate(entry.yaml).raise_if_invalid!.compiled
  end

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

  describe '#run' do
    it 'executes ema cross through the EMA module and returns trades' do
      result = described_class.new(
        system: ema_system,
        symbol: 'BTCUSD',
        timeframe: '1m',
        start_time: start_time.iso8601,
        end_time: end_time.iso8601,
        fee_bps: 4,
        slippage_bps: 2
      ).run(params: { module_period: 3 }, mode: :normal, stage: :in_sample)

      expect(result[:mode]).to eq('normal')
      expect(result[:stage]).to eq('in_sample')
      expect(result[:params]).to include(module_period: 3)
      expect(result[:trades]).to be_an(Array)
      expect(result[:trades]).not_to be_empty
      expect(result[:trades].first).to include(:entryTime, :entryPrice, :direction, :pnl)
    end

    it 'respects position_mode as a system parameter' do
      result = described_class.new(
        system: ema_system,
        symbol: 'BTCUSD',
        timeframe: '1m',
        start_time: start_time.iso8601,
        end_time: end_time.iso8601
      ).run(params: { module_period: 3, position_mode: 'long_only' })

      expect(result[:params]).to include(module_period: 3, position_mode: 'long_only')
      expect(result[:trades].map { |trade| trade[:direction] }.uniq).to eq([ 'long' ])
    end

    it 'executes rsi threshold through the RSI module and returns trades' do
      result = described_class.new(
        system: rsi_system,
        symbol: 'BTCUSD',
        timeframe: '1m',
        start_time: start_time.iso8601,
        end_time: end_time.iso8601
      ).run(params: { module_period: 3, position_mode: 'long_short', lower_threshold: 35, upper_threshold: 65 })

      expect(result[:params]).to include(
        module_period: 3,
        position_mode: 'long_short',
        lower_threshold: 35.0,
        upper_threshold: 65.0
      )
      expect(result[:trades]).to be_an(Array)
    end
  end
end
