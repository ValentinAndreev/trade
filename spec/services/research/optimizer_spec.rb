# frozen_string_literal: true

require 'rails_helper'

RSpec.describe Research::Optimizer do
  let(:backtest) { instance_double(Research::Backtest) }

  before do
    Research::CancellationRegistry.reset!
  end

  let(:ema_system) do
    Research::Systems::Validation::Validator.new(<<~YAML).call.raise_if_invalid!.compiled
      id: price_ema_cross
      name: Price / EMA Cross
      modules:
        ema:
          type: ema
          period: 20
      params:
        position_mode: long_short
      conditions:
        long_entry: "close >> ema.value"
        long_exit: "close << ema.value"
        short_entry: "close << ema.value"
        short_exit: "close >> ema.value"
      optimization:
        targets:
          - ema.period
    YAML
  end

  let(:rsi_system) do
    Research::Systems::Validation::Validator.new(<<~YAML).call.raise_if_invalid!.compiled
      id: rsi_threshold
      name: RSI Threshold
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

  describe '#call' do
    it 'runs all parameter values and keeps each result in memory' do
      allow(backtest).to receive(:run) do |params:, mode:, stage:, cancel_check:|
        { mode: mode.to_s, stage: stage.to_s, params: params, trades: [] }
      end

      results = described_class.new(
        backtest: backtest,
        system: ema_system,
        base_params: { ema_period: 20 }
      ).call(
        target: 'ema.period',
        from: 5,
        to: 9,
        step: 2
      )

      expect(results.map { |run| run[:params][:ema_period] }).to eq([ 5, 7, 9 ])
      expect(results.map { |run| run[:mode] }).to all(eq('optimization'))
      expect(results.map { |run| run[:stage] }).to all(eq('in_sample'))
    end

    it 'supports float optimization ranges for system thresholds' do
      allow(backtest).to receive(:run) do |params:, mode:, stage:, cancel_check:|
        { mode: mode.to_s, stage: stage.to_s, params: params, trades: [] }
      end

      results = described_class.new(
        backtest: backtest,
        system: rsi_system,
        base_params: { lower_threshold: 30.0 }
      ).call(
        target: 'params.lower_threshold',
        from: 25,
        to: 26,
        step: 0.5
      )

      expect(results.map { |run| run[:params][:lower_threshold] }).to eq([ 25.0, 25.5, 26.0 ])
    end

    it 'emits progress updates after each run' do
      progress = instance_double(
        Research::ProgressBroadcaster,
        started: nil, run_completed: nil, finished: nil, failed: nil
      )

      allow(backtest).to receive(:run) do |params:, mode:, stage:, cancel_check:|
        { mode: mode.to_s, stage: stage.to_s, params: params, trades: [] }
      end

      described_class.new(
        backtest: backtest,
        system: ema_system,
        base_params: { ema_period: 20 },
        progress_interval: 0
      ).call(
        target: 'ema.period',
        from: 5,
        to: 9,
        step: 2,
        progress: progress
      )

      expect(progress).to have_received(:started).with(total_runs: 3, mode: :optimization, target: 'ema.period')
      expect(progress).to have_received(:run_completed).exactly(3).times
      expect(progress).to have_received(:finished).with(hash_including(total_runs: 3))
    end

    it 'throttles progress updates by elapsed time' do
      progress = instance_double(
        Research::ProgressBroadcaster,
        started: nil, run_completed: nil, finished: nil, failed: nil
      )
      clock_values = [
        0.0,  # started_at
        0.0,  # run1_started_at
        0.2,  # now after run1
        0.2,  # run2_started_at
        0.8,  # now after run2
        0.8,  # run3_started_at
        1.4,  # now after run3 -> publish
        1.4   # finished elapsed
      ]

      allow(backtest).to receive(:run) do |params:, mode:, stage:, cancel_check:|
        { mode: mode.to_s, stage: stage.to_s, params: params, trades: [] }
      end

      optimizer = described_class.new(
        backtest: backtest,
        system: ema_system,
        base_params: { ema_period: 20 },
        progress_interval: 1.0
      )

      allow(optimizer).to receive(:monotonic_now).and_return(*clock_values)

      optimizer.call(
        target: 'ema.period',
        from: 5,
        to: 7,
        step: 1,
        progress: progress
      )

      expect(progress).to have_received(:run_completed).once
      expect(progress).to have_received(:run_completed).with(
        total_runs: 3,
        completed_runs: 3,
        current_value: 7,
        last_run_ms: be_within(0.001).of(600.0),
        elapsed_ms: 1400.0
      )
    end

    it 'stops optimization when the run is cancelled' do
      progress = instance_double(
        Research::ProgressBroadcaster,
        started: nil, run_completed: nil, finished: nil, failed: nil, cancelled: nil
      )
      run_count = 0

      allow(backtest).to receive(:run) do |params:, mode:, stage:, cancel_check:|
        run_count += 1
        Research::CancellationRegistry.cancel('run-123') if run_count == 1
        { mode: mode.to_s, stage: stage.to_s, params: params, trades: [] }
      end

      results = described_class.new(
        backtest: backtest,
        system: ema_system,
        base_params: { ema_period: 20 }
      ).call(
        target: 'ema.period',
        from: 5,
        to: 9,
        step: 2,
        run_id: 'run-123',
        progress: progress
      )

      expect(results.length).to eq(1)
      expect(results.first.dig(:params, :ema_period)).to eq(5)
      expect(backtest).to have_received(:run).once
      expect(progress).to have_received(:cancelled).with(hash_including(total_runs: 3, completed_runs: 1))
      expect(progress).not_to have_received(:finished)
    end

    it 'records ml_signal failures per parameter value without aborting the full optimization' do
      progress = instance_double(
        Research::ProgressBroadcaster,
        started: nil, run_completed: nil, finished: nil, failed: nil
      )
      allow(backtest).to receive(:run) do |params:, mode:, stage:, cancel_check:|
        raise Research::Modules::MlSignal::Error.new('adapter offline', code: :adapter_unavailable, details: { retry: true }) if params[:ema_period] == 7

        { mode: mode.to_s, stage: stage.to_s, params: params, trades: [] }
      end

      results = described_class.new(
        backtest: backtest,
        system: ema_system,
        base_params: { ema_period: 20 },
        progress_interval: 0
      ).call(
        target: 'ema.period',
        from: 5,
        to: 9,
        step: 2,
        progress:
      )

      expect(results.length).to eq(3)
      expect(results.second).to include(status: 'failed', trades: [])
      expect(results.second.fetch(:diagnostics)).to include(
        code: 'adapter_unavailable',
        message: 'adapter offline',
        details: { retry: true }
      )
      expect(progress).to have_received(:run_completed).exactly(3).times
      expect(progress).to have_received(:finished).with(hash_including(total_runs: 3))
      expect(progress).not_to have_received(:failed)
    end

    it 'does not mask ml_signal failures when failed params serialization raises' do
      progress = instance_double(
        Research::ProgressBroadcaster,
        started: nil, run_completed: nil, finished: nil, failed: nil
      )
      allow(backtest).to receive(:run) do
        raise Research::Modules::MlSignal::Error.new('adapter offline', code: :adapter_unavailable, details: { retry: true })
      end
      allow(ema_system).to receive(:run_params).and_raise(ArgumentError, 'bad params')

      results = described_class.new(
        backtest: backtest,
        system: ema_system,
        base_params: { ema_period: 20 },
        progress_interval: 0
      ).call(
        target: 'ema.period',
        from: 7,
        to: 7,
        step: 1,
        progress:
      )

      expect(results.length).to eq(1)
      expect(results.first).to include(status: 'failed', params: { ema_period: 7 }, trades: [])
      expect(results.first.fetch(:diagnostics)).to include(
        code: 'adapter_unavailable',
        message: 'adapter offline',
        details: { retry: true }
      )
      expect(progress).to have_received(:finished).with(hash_including(total_runs: 1))
      expect(progress).not_to have_received(:failed)
    end
  end
end
