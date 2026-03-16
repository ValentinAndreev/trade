# frozen_string_literal: true

require 'rails_helper'

RSpec.describe Research::Optimizer do
  let(:executor) { instance_double(Research::Executor) }
  let(:ema_system) { Research::SystemRegistry.fetch(system_type: 'price_module_cross', module_type: 'ema') }
  let(:rsi_system) { Research::SystemRegistry.fetch(system_type: 'oscillator_threshold', module_type: 'rsi') }

  describe '#call' do
    it 'runs all parameter values and keeps each result in memory' do
      allow(executor).to receive(:run) do |params:, mode:, stage:|
        {
          mode: mode.to_s,
          stage: stage.to_s,
          params: params,
          trades: []
        }
      end

      results = described_class.new(
        executor: executor,
        system: ema_system,
        base_params: { module_period: 20 }
      ).call(
        target: 'module.period',
        from: 5,
        to: 9,
        step: 2
      )

      expect(results.map { |run| run[:params][:module_period] }).to eq([ 5, 7, 9 ])
      expect(results.map { |run| run[:mode] }).to all(eq('optimization'))
      expect(results.map { |run| run[:stage] }).to all(eq('in_sample'))
    end

    it 'supports float optimization ranges for system thresholds' do
      allow(executor).to receive(:run) do |params:, mode:, stage:|
        { mode: mode.to_s, stage: stage.to_s, params: params, trades: [] }
      end

      results = described_class.new(
        executor: executor,
        system: rsi_system,
        base_params: { lower_threshold: 30.0 }
      ).call(
        target: 'system.lower_threshold',
        from: 25,
        to: 26,
        step: 0.5
      )

      expect(results.map { |run| run[:params][:lower_threshold] }).to eq([ 25.0, 25.5, 26.0 ])
    end

    it 'emits progress updates after each run' do
      progress = instance_double(Research::ProgressBroadcaster, started: nil, run_completed: nil, finished: nil, failed: nil)

      allow(executor).to receive(:run) do |params:, mode:, stage:|
        { mode: mode.to_s, stage: stage.to_s, params: params, trades: [] }
      end

      described_class.new(
        executor: executor,
        system: ema_system,
        base_params: { module_period: 20 },
        progress_interval: 0
      ).call(
        target: 'module.period',
        from: 5,
        to: 9,
        step: 2,
        progress: progress
      )

      expect(progress).to have_received(:started).with(total_runs: 3, mode: :optimization, target: 'module.period')
      expect(progress).to have_received(:run_completed).exactly(3).times
      expect(progress).to have_received(:finished).with(hash_including(total_runs: 3))
    end

    it 'throttles progress updates by elapsed time' do
      progress = instance_double(Research::ProgressBroadcaster, started: nil, run_completed: nil, finished: nil, failed: nil)
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

      allow(executor).to receive(:run) do |params:, mode:, stage:|
        { mode: mode.to_s, stage: stage.to_s, params: params, trades: [] }
      end

      optimizer = described_class.new(
        executor: executor,
        system: ema_system,
        base_params: { module_period: 20 },
        progress_interval: 1.0
      )

      allow(optimizer).to receive(:monotonic_now).and_return(*clock_values)

      optimizer.call(
        target: 'module.period',
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
  end
end
