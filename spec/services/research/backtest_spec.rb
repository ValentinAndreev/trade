# frozen_string_literal: true

require 'rails_helper'

RSpec.describe Research::Backtest do
  let(:start_time)   { Time.utc(2026, 1, 1, 12, 0) }
  let(:end_time)     { start_time + 15.minutes }
  let(:close_values) { [ 100, 101, 102, 101, 99, 97, 98, 100, 103, 104, 102, 99, 96, 97, 100, 104 ] }

  let(:ema_system) do
    entry = Research::Dsl::Catalog.find('price_ema_cross')
    raise 'ema system not found' unless entry

    Research::Dsl::Catalog.validate(entry.yaml).raise_if_invalid!.compiled
  end

  let(:rsi_system) do
    entry = Research::Dsl::Catalog.find('rsi_threshold')
    raise 'rsi system not found' unless entry

    Research::Dsl::Catalog.validate(entry.yaml).raise_if_invalid!.compiled
  end

  let(:ema_rsi_system) do
    Research::Dsl::Catalog.validate(<<~YAML).raise_if_invalid!.compiled
      id: ema_rsi_combo
      name: EMA + RSI Combo
      modules:
        ema:
          period: 20
        rsi:
          period: 14
      params:
        position_mode: long_short
        lower_threshold: 30
        upper_threshold: 70
      conditions:
        long_entry: "(close >> ema.value) && (rsi.value < params.lower_threshold)"
        long_exit: "(close << ema.value) || (rsi.value > params.upper_threshold)"
        short_entry: "(close << ema.value) && (rsi.value > params.upper_threshold)"
        short_exit: "(close >> ema.value) || (rsi.value < params.lower_threshold)"
    YAML
  end

  before do
    Rails.cache.clear

    close_values.each_with_index do |close, index|
      ts = start_time + index.minutes
      create(
        :candle,
        symbol: 'BTCUSD', exchange: 'bitfinex', timeframe: '1m', ts: ts,
        open: close - 0.5, high: close + 1.0, low: close - 1.0, close: close.to_f, volume: 10.0 + index
      )
    end
  end

  describe '#run' do
    it 'runs ema cross through the EMA module and returns trades' do
      result = described_class.new(
        system: ema_system, symbol: 'BTCUSD', timeframe: '1m',
        start_time: start_time.iso8601, end_time: end_time.iso8601,
        fee_bps: 4, slippage_bps: 2
      ).run(params: { ema_period: 3 }, mode: :normal, stage: :in_sample)

      expect(result[:mode]).to eq('normal')
      expect(result[:stage]).to eq('in_sample')
      expect(result[:params]).to include(module_period: 3, ema_period: 3)
      expect(result[:trades]).to be_an(Array)
      expect(result[:trades]).not_to be_empty
      expect(result[:trades].first).to include(:entryTime, :entryPrice, :direction, :pnl)
    end

    it 'respects position_mode' do
      result = described_class.new(
        system: ema_system, symbol: 'BTCUSD', timeframe: '1m',
        start_time: start_time.iso8601, end_time: end_time.iso8601
      ).run(params: { ema_period: 3, position_mode: 'long_only' })

      expect(result[:params]).to include(module_period: 3, ema_period: 3, position_mode: 'long_only')
      expect(result[:trades].map { |t| t[:direction] }.uniq).to eq([ 'long' ])
    end

    it 'runs rsi threshold through the RSI module and returns trades' do
      result = described_class.new(
        system: rsi_system, symbol: 'BTCUSD', timeframe: '1m',
        start_time: start_time.iso8601, end_time: end_time.iso8601
      ).run(params: { rsi_period: 3, position_mode: 'long_short', lower_threshold: 35, upper_threshold: 65 })

      expect(result[:params]).to include(
        module_period: 3, rsi_period: 3, position_mode: 'long_short',
        lower_threshold: 35.0, upper_threshold: 65.0
      )
      expect(result[:trades]).to be_an(Array)
    end

    it 'reuses unchanged module results across runs' do
      ema_runner = instance_double(Research::Modules::Ema)
      rsi_runner = instance_double(Research::Modules::Rsi)
      candle_times = Candle.order(:ts).pluck(:ts)

      allow(Research::Modules::Ema).to receive(:new).and_return(ema_runner)
      allow(Research::Modules::Rsi).to receive(:new).and_return(rsi_runner)
      allow(ema_runner).to receive(:call) do |period:|
        candle_times.map { |time| { time:, result: { value: period.to_f } } }
      end
      allow(rsi_runner).to receive(:call) do |period:|
        candle_times.map { |time| { time:, result: { value: period.to_f } } }
      end

      backtest = described_class.new(
        system: ema_rsi_system, symbol: 'BTCUSD', timeframe: '1m',
        start_time: start_time.iso8601, end_time: end_time.iso8601
      )

      backtest.run(params: { ema_period: 5, rsi_period: 14, lower_threshold: 30, upper_threshold: 70 })
      backtest.run(params: { ema_period: 8, rsi_period: 14, lower_threshold: 30, upper_threshold: 70 })

      expect(ema_runner).to have_received(:call).twice
      expect(rsi_runner).to have_received(:call).once
    end

    it 'evaluates only the signals needed for the current position state' do
      signal_calls = []
      system = instance_double(Research::System)

      allow(system).to receive(:module_runtime_configs).and_return({})
      allow(system).to receive(:run_params) { |params| params }
      allow(system).to receive(:signal_for) do |name, prev_row:, row:, params:|
        signal_calls << name
        name == :long_entry && row[:time] == (start_time + 1.minute).to_i
      end

      described_class.new(
        system:, symbol: 'BTCUSD', timeframe: '1m',
        start_time: start_time.iso8601, end_time: end_time.iso8601
      ).run(params: { position_mode: 'long_short' })

      expect(signal_calls.count(:long_entry)).to eq(1)
      expect(signal_calls.count(:short_entry)).to eq(1)
      expect(signal_calls.count(:long_exit)).to eq(close_values.length - 3)
      expect(signal_calls.count(:short_exit)).to eq(0)
    end
  end
end
