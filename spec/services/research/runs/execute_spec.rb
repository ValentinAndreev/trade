# frozen_string_literal: true

require 'rails_helper'

RSpec.describe Research::Runs::Execute do
  let(:raw_params) { { run_id: 'run-123' } }
  let(:progress_broadcaster) { instance_double(Research::ProgressBroadcaster) }
  let(:progress_session) do
    instance_double(
      Research::Runs::ProgressSession,
      started: nil,
      run_completed: nil,
      finished: nil,
      cancelled: nil,
      failed: nil,
      current_time: 10.0,
      broadcaster: progress_broadcaster,
      total_elapsed_ms: 25.0
    )
  end

  before do
    allow(Research::Runs::ProgressSession).to receive(:new).with(run_id: 'run-123').and_return(progress_session)
    allow(Rails.logger).to receive(:info)
  end

  describe '#call' do
    it 'runs a single backtest and reports progress through the session' do
      request = instance_double(
        Research::RunRequest,
        backtest_config: {
          system: :compiled_system,
          symbol: 'BTCUSD',
          timeframe: '1m',
          start_time: '2026-01-01T00:00:00Z',
          end_time: '2026-01-02T00:00:00Z',
          exchange: 'bitfinex',
          fee_bps: 4,
          slippage_bps: 2
        },
        optimization_enabled?: false,
        runtime_params: { ema_period: 5 },
        progress_run_id: 'run-123',
        revalidate!: nil,
        response_payload: { 'runs' => [ { 'params' => { 'ema_period' => 5 } } ] }
      )
      backtest = instance_double(Research::Backtest)
      run = { trades: [ { pnl: 1.25 } ] }

      allow(Research::RunRequest).to receive(:new).with(raw_params).and_return(request)
      allow(Research::Backtest).to receive(:new).and_return(backtest)
      allow(backtest).to receive(:run).with(params: { ema_period: 5 }, cancel_check: kind_of(Research::CancellationCheck::Callable)).and_return(run)
      allow(request).to receive(:response_payload).with(runs: [ run ]).and_return({ 'runs' => [ run ] })

      result = described_class.new(raw_params).call

      expect(progress_session).to have_received(:started).with(total_runs: 1, mode: :normal)
      expect(progress_session).to have_received(:run_completed).with(
        total_runs: 1,
        completed_runs: 1,
        run_started_at: 10.0
      )
      expect(progress_session).to have_received(:finished).with(total_runs: 1)
      expect(result.status).to eq(:ok)
      expect(result.payload).to eq({ 'runs' => [ run ] })
    end

    it 'passes cancellation context to single backtests and returns a cancelled result' do
      request = instance_double(
        Research::RunRequest,
        backtest_config: {
          system: :compiled_system,
          symbol: 'BTCUSD',
          timeframe: '1m',
          start_time: '2026-01-01T00:00:00Z',
          end_time: '2026-01-02T00:00:00Z',
          exchange: 'bitfinex',
          fee_bps: 4,
          slippage_bps: 2
        },
        optimization_enabled?: false,
        runtime_params: { ema_period: 5 },
        progress_run_id: 'run-123',
        revalidate!: nil
      )
      backtest = instance_double(Research::Backtest)

      allow(Research::RunRequest).to receive(:new).with(raw_params).and_return(request)
      allow(Research::Backtest).to receive(:new).and_return(backtest)
      allow(backtest).to receive(:run) do |params:, cancel_check:|
        expect(params).to eq(ema_period: 5)
        Research::CancellationRegistry.cancel('run-123')
        expect { cancel_check.check_cancelled! }.to raise_error(Research::Cancelled)
        raise Research::Backtest::Cancelled
      end
      allow(request).to receive(:response_payload).with(runs: []).and_return({ 'runs' => [] })

      result = described_class.new(raw_params).call

      expect(progress_session).to have_received(:cancelled).with(total_runs: 1, completed_runs: 0)
      expect(result.status).to eq(:ok)
      expect(result.payload).to eq({ 'runs' => [] })
    end

    it 'returns structured ml_signal inference errors' do
      request = instance_double(
        Research::RunRequest,
        backtest_config: {
          system: :compiled_system,
          symbol: 'BTCUSD',
          timeframe: '1m',
          start_time: '2026-01-01T00:00:00Z',
          end_time: '2026-01-02T00:00:00Z',
          exchange: 'bitfinex',
          fee_bps: 4,
          slippage_bps: 2
        },
        optimization_enabled?: false,
        runtime_params: { ema_period: 5 },
        progress_run_id: 'run-123',
        revalidate!: nil
      )
      backtest = instance_double(Research::Backtest)
      error = Research::Modules::MlSignal::Error.new(
        'adapter offline',
        code: :adapter_unavailable,
        details: { reason: 'maintenance' }
      )

      allow(Research::RunRequest).to receive(:new).with(raw_params).and_return(request)
      allow(Research::Backtest).to receive(:new).and_return(backtest)
      allow(backtest).to receive(:run).and_raise(error)

      result = described_class.new(raw_params).call

      expect(progress_session).to have_received(:failed).with(message: 'adapter offline')
      expect(result.status).to eq(:unprocessable_entity)
      expect(result.payload).to eq(
        error: 'adapter offline',
        diagnostics: [
          {
            code: 'adapter_unavailable',
            message: 'adapter offline',
            details: { reason: 'maintenance' }
          }
        ]
      )
    end

    it 'delegates optimization runs to Research::Optimizer' do
      request = instance_double(
        Research::RunRequest,
        backtest_config: {
          system: :compiled_system,
          symbol: 'BTCUSD',
          timeframe: '1m',
          start_time: '2026-01-01T00:00:00Z',
          end_time: '2026-01-02T00:00:00Z',
          exchange: 'bitfinex',
          fee_bps: 0,
          slippage_bps: 0
        },
        optimization_enabled?: true,
        system: :compiled_system,
        runtime_params: { ema_period: 5 },
        optimization_target: 'ema.period',
        progress_run_id: 'run-123',
        optimization_range: { from: 3, to: 7, step: 2 },
        revalidate!: nil,
        response_payload: { 'runs' => [ { 'params' => { 'ema_period' => 3 } } ] }
      )
      backtest = instance_double(Research::Backtest)
      optimizer = instance_double(Research::Optimizer)
      runs = [ { trades: [], params: { ema_period: 3 } } ]

      allow(Research::RunRequest).to receive(:new).with(raw_params).and_return(request)
      allow(Research::Backtest).to receive(:new).and_return(backtest)
      allow(Research::Optimizer).to receive(:new).with(
        backtest: backtest,
        system: :compiled_system,
        base_params: { ema_period: 5 }
      ).and_return(optimizer)
      allow(optimizer).to receive(:call).with(
        target: 'ema.period',
        progress: progress_broadcaster,
        run_id: 'run-123',
        from: 3,
        to: 7,
        step: 2
      ).and_return(runs)
      allow(request).to receive(:response_payload).with(runs: runs).and_return({ 'runs' => runs })

      result = described_class.new(raw_params).call

      expect(progress_session).not_to have_received(:started)
      expect(result.status).to eq(:ok)
      expect(result.payload).to eq({ 'runs' => runs })
    end

    it 'returns validation errors as unprocessable_entity and marks progress failed' do
      diagnostic = Research::Systems::Validation::Diagnostic.new(
        message: 'System YAML is invalid',
        line: 1,
        column: 1,
        length: 1,
        code: 'yaml_invalid'
      )
      error = Research::Systems::Validation::Error.new([ diagnostic ])

      allow(Research::RunRequest).to receive(:new).with(raw_params).and_raise(error)

      result = described_class.new(raw_params).call

      expect(progress_session).to have_received(:failed).with(message: 'System YAML is invalid')
      expect(result.status).to eq(:unprocessable_entity)
      expect(result.payload).to eq(
        error: 'System YAML is invalid',
        diagnostics: [ diagnostic.to_h ]
      )
    end
  end
end
