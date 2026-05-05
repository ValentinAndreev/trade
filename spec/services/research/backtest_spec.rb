# frozen_string_literal: true

require 'rails_helper'

RSpec.describe Research::Backtest do
  let(:start_time)   { Time.utc(2026, 1, 1, 12, 0) }
  let(:end_time)     { start_time + 15.minutes }
  let(:close_values) { [ 100, 101, 102, 101, 99, 97, 98, 100, 103, 104, 102, 99, 96, 97, 100, 104 ] }

  let(:ema_system) do
    entry = Research::Systems::Catalog.find('price_ema_cross')
    raise 'ema system not found' unless entry

    Research::Systems::Validation::Validator.new(entry.yaml).call.raise_if_invalid!.compiled
  end

  let(:rsi_system) do
    entry = Research::Systems::Catalog.find('rsi_threshold')
    raise 'rsi system not found' unless entry

    Research::Systems::Validation::Validator.new(entry.yaml).call.raise_if_invalid!.compiled
  end

  let(:ema_rsi_system) do
    Research::Systems::Validation::Validator.new(<<~YAML).call.raise_if_invalid!.compiled
      id: ema_rsi_combo
      name: EMA + RSI Combo
      modules:
        ema:
          type: ema
          period: 20
        rsi:
          type: rsi
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

  let(:ema_pair_system) do
    Research::Systems::Validation::Validator.new(<<~YAML).call.raise_if_invalid!.compiled
      id: ema_fast_slow_cross
      name: EMA Fast / Slow Cross
      modules:
        ema_fast:
          type: ema
          period: 10
        ema_slow:
          type: ema
          period: 20
      params:
        position_mode: long_short
      conditions:
        long_entry: "ema_fast.value >> ema_slow.value"
        long_exit: "ema_fast.value << ema_slow.value"
        short_entry: "ema_fast.value << ema_slow.value"
        short_exit: "ema_fast.value >> ema_slow.value"
    YAML
  end

  let(:history_helper_system) do
    Research::Systems::Validation::Validator.new(<<~YAML).call.raise_if_invalid!.compiled
      id: history_helper_system
      name: History Helper System
      modules:
        ema:
          type: ema
          period: 3
      params:
        position_mode: long_short
      conditions:
        long_entry: "close > max(prev(close), offset(close, 2))"
        long_exit: "close < prev(close)"
        short_entry: "close < min(prev(close), offset(close, 2))"
        short_exit: "close > prev(close)"
    YAML
  end

  let(:mvrv_filter_system) do
    Research::Systems::Validation::Validator.new(<<~YAML).call.raise_if_invalid!.compiled
      id: mvrv_filter_system
      name: MVRV Filter System
      modules:
        mvrv:
          type: external_series
          key: mvrv_ratio
      params:
        position_mode: long_only
        upper_threshold: 1.0
      conditions:
        long_entry: "mvrv.value < params.upper_threshold"
        long_exit: "mvrv.value >= params.upper_threshold"
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
      expect(result[:params]).to include(ema_period: 3, position_mode: 'long_short')
      expect(result[:trades]).to be_an(Array)
      expect(result[:trades]).not_to be_empty
      expect(result[:trades].first).to include(:entryTime, :entryPrice, :direction, :pnl)
    end

    it 'respects position_mode' do
      result = described_class.new(
        system: ema_system, symbol: 'BTCUSD', timeframe: '1m',
        start_time: start_time.iso8601, end_time: end_time.iso8601
      ).run(params: { ema_period: 3, position_mode: 'long_only' })

      expect(result[:params]).to include(ema_period: 3, position_mode: 'long_only')
      expect(result[:trades].map { |t| t[:direction] }.uniq).to eq([ 'long' ])
    end

    it 'runs rsi threshold through the RSI module and returns trades' do
      result = described_class.new(
        system: rsi_system, symbol: 'BTCUSD', timeframe: '1m',
        start_time: start_time.iso8601, end_time: end_time.iso8601
      ).run(params: { rsi_period: 3, position_mode: 'long_short', lower_threshold: 35, upper_threshold: 65 })

      expect(result[:params]).to include(
        rsi_period: 3, position_mode: 'long_short',
        lower_threshold: 35.0, upper_threshold: 65.0
      )
      expect(result[:trades]).to be_an(Array)
    end

    it 'runs multiple EMA instances and evaluates their crossover' do
      result = described_class.new(
        system: ema_pair_system, symbol: 'BTCUSD', timeframe: '1m',
        start_time: start_time.iso8601, end_time: end_time.iso8601
      ).run(params: { ema_fast_period: 3, ema_slow_period: 5, position_mode: 'long_short' })

      expect(result[:params]).to include(
        ema_fast_period: 3,
        position_mode: 'long_short',
        ema_slow_period: 5
      )
      expect(result[:trades]).to be_an(Array)
      expect(result[:trades]).not_to be_empty
    end

    it 'supports prev and offset helper functions in signal conditions' do
      result = described_class.new(
        system: history_helper_system, symbol: 'BTCUSD', timeframe: '1m',
        start_time: start_time.iso8601, end_time: end_time.iso8601
      ).run(params: { ema_period: 3, position_mode: 'long_short' })

      expect(result[:params]).to include(ema_period: 3, position_mode: 'long_short')
      expect(result[:trades]).to be_an(Array)
      expect(result[:trades]).not_to be_empty
    end

    it 'uses external series modules as backtest filters' do
      # mvrv = 0.8 for candles 0-7; crosses to 1.2 on candle 8 (start_time + 8min)
      create(:macro_series, source: 'coin_metrics', indicator: 'mvrv_ratio', ts: start_time - 1.day, value: 0.8)
      create(:macro_series, source: 'coin_metrics', indicator: 'mvrv_ratio', ts: start_time + 8.minutes, value: 1.2)

      result = described_class.new(
        system: mvrv_filter_system, symbol: 'BTCUSD', timeframe: '1m',
        start_time: start_time.iso8601, end_time: end_time.iso8601
      ).run(params: { position_mode: 'long_only', upper_threshold: 1.0 })

      expect(result[:params]).to include(position_mode: 'long_only', upper_threshold: 1.0)

      trades = result[:trades]
      expect(trades.length).to eq(1)

      trade = trades.first
      expect(trade[:direction]).to eq('long')

      # Entry fires while mvrv = 0.8 < upper_threshold; fills on the next candle
      expect(trade[:entryTime]).to be < (start_time + 8.minutes).to_i

      # Exit fires on candle 8 (mvrv crosses to 1.2 >= upper_threshold); fills on candle 9
      expect(trade[:exitTime]).to eq((start_time + 9.minutes).to_i)

      # No new long entries after mvrv crosses the threshold
      expect(trades.none? { |t| t[:entryTime] >= (start_time + 8.minutes).to_i }).to be true
    end

    it 'uses ml_signal module values in backtest conditions' do
      create_trained_ml_model(key: 'btc_direction_backtest')
      system = Research::Systems::Validation::Validator.new(<<~YAML, dataset: ml_dataset).call.raise_if_invalid!.compiled
        id: ml_signal_backtest
        name: ML Signal Backtest
        modules:
          signal:
            type: ml_signal
            model_key: btc_direction_backtest
        params:
          position_mode: long_only
        conditions:
          long_entry: "signal.value > 0.6"
          long_exit: "signal.value < 0.5"
      YAML
      runner = instance_double(Research::Modules::MlSignal)
      signal_values = close_values.each_index.map { |index| index < 3 ? 0.7 : 0.4 }
      allow(Research::Modules::MlSignal).to receive(:new).with(
        candles: kind_of(Array),
        symbol: 'BTCUSD',
        timeframe: '1m',
        exchange: 'bitfinex',
        start_time: start_time.iso8601,
        end_time: end_time.iso8601
      ).and_return(runner)
      allow(runner).to receive(:call) do |model_key:, output: 'probability', cancel_check: nil|
        expect(model_key).to eq('btc_direction_backtest')
        expect(output).to eq('probability')
        expect(cancel_check).to be_nil
        close_values.each_index.map do |index|
          { time: (start_time + index.minutes).to_i, result: { value: signal_values[index] } }
        end
      end

      result = described_class.new(
        system:, symbol: 'BTCUSD', timeframe: '1m',
        start_time: start_time.iso8601, end_time: end_time.iso8601
      ).run(params: { position_mode: 'long_only' })

      expect(result[:trades].length).to eq(1)
      expect(result[:trades].first[:direction]).to eq('long')
    end

    it 'passes cancellation context to ml_signal modules' do
      create_trained_ml_model(key: 'btc_direction_cancel')
      system = Research::Systems::Validation::Validator.new(<<~YAML, dataset: ml_dataset).call.raise_if_invalid!.compiled
        id: ml_signal_cancel
        name: ML Signal Cancel
        modules:
          signal:
            type: ml_signal
            model_key: btc_direction_cancel
        conditions:
          long_entry: "signal.value > 0.6"
      YAML
      runner = instance_double(Research::Modules::MlSignal)
      cancel_check = -> { false }
      allow(Research::Modules::MlSignal).to receive(:new).and_return(runner)
      allow(runner).to receive(:call).and_return([])

      described_class.new(
        system:, symbol: 'BTCUSD', timeframe: '1m',
        start_time: start_time.iso8601, end_time: end_time.iso8601
      ).run(params: {}, cancel_check:)

      expect(runner).to have_received(:call).with(hash_including(cancel_check:))
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
      system = instance_double(Research::Systems::Definition)

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

    it 'supports cooperative cancellation during the current backtest run' do
      system = instance_double(Research::Systems::Definition)
      checks = 0

      allow(system).to receive(:module_runtime_configs).and_return({})
      allow(system).to receive(:run_params) { |params| params }
      allow(system).to receive(:signal_for).and_return(false)

      backtest = described_class.new(
        system:, symbol: 'BTCUSD', timeframe: '1m',
        start_time: start_time.iso8601, end_time: end_time.iso8601
      )

      expect do
        backtest.run(
          params: { position_mode: 'long_short' },
          cancel_check: -> do
            checks += 1
            checks > 3
          end
        )
      end.to raise_error(Research::Backtest::Cancelled)
    end
  end

  def ml_dataset
    {
      symbol: 'BTCUSD',
      exchange: 'bitfinex',
      timeframe: '1m'
    }
  end

  def create_trained_ml_model(key:)
    model = create(:ml_model, key:, serving_status: 'draft')
    run = create(
      :ml_training_run,
      :succeeded,
      ml_model: model,
      dataset_spec: {
        symbol: 'BTCUSD',
        exchange: 'bitfinex',
        timeframe: '1m',
        label_horizon: 1
      },
      resolved_feature_spec: Ml::FeatureWindow.new(feature_spec: [ { type: 'log_return', params: { period: 1 } } ]).resolved_feature_spec
    )
    model.update!(
      serving_status: 'trained',
      latest_successful_training_run: run,
      serving_weight_checksum: run.weight_checksum
    )
    model
  end
end
