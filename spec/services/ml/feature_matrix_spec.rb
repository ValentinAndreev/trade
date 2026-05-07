# frozen_string_literal: true

require 'rails_helper'

RSpec.describe Ml::FeatureMatrix do
  let(:start_time) { Time.utc(2026, 1, 1) }
  let(:candles) do
    [ 100.0, 101.0, 103.0, 102.0 ].map.with_index do |close, index|
      {
        time: (start_time + index.minutes).to_i,
        open: close - 0.5,
        high: close + 2.0,
        low: close - 2.0,
        close:,
        volume: 1_000.0 + index
      }
    end
  end

  describe Ml::FeatureWindow do
    it 'uses normalized/state/risk modules as the default feature spec' do
      types = described_class.default_feature_spec.map { |entry| entry.fetch('type') }

      expect(types).to eq(%w[
        log_return rolling_volatility range_position rolling_zscore percentile_rank
        trend_regime_score vol_regime_score vol_adjust
      ])
      expect(types).not_to include('close')
    end

    it 'resolves module metadata, concrete params and effective window' do
      window = described_class.new(feature_spec: [
        { type: 'log_return', params: { period: '2' } },
        { type: 'vol_adjust', params: { period: 3, field: 'volume' }, name: 'volume_risk' }
      ])

      expect(window.effective_window).to eq(3)
      expect(window.feature_names).to eq(%w[log_return volume_risk])
      expect(window.resolved_feature_spec.first).to include(
        'type' => 'log_return',
        'params' => { 'period' => 2 },
        'outputs' => [ 'value' ],
        'warmup' => 2,
        'lookback' => 2,
        'lookahead' => 0,
        'module_version' => '1'
      )
      expect(window.resolved_feature_spec.first.fetch('definition_checksum')).to match(/\A[0-9a-f]{64}\z/)
    end

    it 'rejects modules without ML feature metadata' do
      expect do
        described_class.new(feature_spec: [ { type: 'sma', params: { period: 2 } } ]).resolved_feature_spec
      end.to raise_error(described_class::Error, /missing ML metadata/)
    end

    it 'rejects unsupported outputs before feature building' do
      expect do
        described_class.new(feature_spec: [ { type: 'log_return', output: 'missing' } ]).resolved_feature_spec
      end.to raise_error(described_class::Error, /does not expose output fields/)
    end

    it 'rejects empty output lists before a feature disappears from the matrix' do
      expect do
        described_class.new(feature_spec: [ { type: 'log_return', outputs: [] } ]).resolved_feature_spec
      end.to raise_error(described_class::Error) { |error| expect(error.code).to eq(:empty_outputs) }
    end

    it 'rejects positive-lookahead feature modules' do
      metadata = IndicatorsConfig.schema_metadata_for(:log_return).merge('lookahead' => 1)
      allow(IndicatorsConfig).to receive(:schema_metadata_for).and_call_original
      allow(IndicatorsConfig).to receive(:schema_metadata_for).with('log_return').and_return(metadata)

      expect do
        described_class.new(feature_spec: [ { type: 'log_return' } ]).resolved_feature_spec
      end.to raise_error(described_class::Error, /positive lookahead/)
    end

    it 'rejects invalid numeric feature params instead of silently coercing them to zero' do
      expect do
        described_class.new(feature_spec: [
          { type: 'vol_adjust', params: { period: 20, epsilon: 'abc' } }
        ]).resolved_feature_spec
      end.to raise_error(ArgumentError, /epsilon must be a number/)
    end

    it 'does not treat resolved metadata keys as feature params' do
      resolved = described_class.new(feature_spec: [
        {
          type: 'log_return',
          period: 2,
          module_version: 'old',
          definition_checksum: 'not-a-param',
          warmup: 999,
          lookback: 999
        }
      ]).resolved_feature_spec

      expect(resolved.first.fetch('params')).to eq('period' => 2)
      expect(resolved.first.fetch('warmup')).to eq(2)
    end

    it 'includes upstream module lookback in input-ref transform windows' do
      window = described_class.new(feature_spec: [
        { type: 'log_return', name: 'returns', params: { period: 2 } },
        {
          type: 'lag',
          name: 'lagged_returns',
          params: {
            input: { kind: 'module', module_ref: 'returns', output: 'value' },
            period: 1
          }
        }
      ])
      lagged = window.resolved_feature_spec.fetch(1)

      expect(lagged.fetch('warmup')).to eq(1)
      expect(lagged.fetch('lookback')).to eq(3)
      expect(window.effective_window).to eq(3)
    end
  end

  describe '#call' do
    it 'builds candle-aligned feature rows and nils rows before warmup' do
      resolved = Ml::FeatureWindow.new(feature_spec: [
        { type: 'log_return', params: { period: 2 } },
        { type: 'range_position', params: { period: 2 } }
      ]).resolved_feature_spec

      result = described_class.new(candles:, resolved_feature_spec: resolved).call

      expect(result.feature_names).to eq(%w[log_return range_position])
      expect(result.rows.map { |row| row[:time] }).to eq(candles.map { |candle| candle[:time] })
      expect(result.rows[1]).to include(complete: false, source_window_checksum: nil)
      expect(result.rows[2][:features].fetch('log_return')).to be_within(0.000001).of(Math.log(103.0 / 100.0))
      expect(result.rows[2][:features].fetch('range_position')).to be_between(0.0, 1.0).inclusive
      expect(result.rows[2]).to include(complete: true)
      expect(result.rows[2][:source_window_checksum]).to match(/\A[0-9a-f]{64}\z/)
    end

    it 'marks window-of-period native modules complete on the first full trailing window' do
      resolved = Ml::FeatureWindow.new(feature_spec: [
        { type: 'range_position', params: { period: 2 } }
      ]).resolved_feature_spec

      result = described_class.new(candles:, resolved_feature_spec: resolved).call

      expect(resolved.first).to include('warmup' => 1, 'lookback' => 1)
      expect(result.effective_window).to eq(1)
      expect(result.rows[0]).to include(complete: false, source_window_checksum: nil)
      expect(result.rows[1]).to include(complete: true)
      expect(result.rows[1][:features].fetch('range_position')).to be_between(0.0, 1.0).inclusive
    end

    it 'uses transitive input-ref lookback for completeness and source checksums' do
      resolved = Ml::FeatureWindow.new(feature_spec: [
        { type: 'log_return', name: 'returns', params: { period: 2 } },
        {
          type: 'lag',
          name: 'lagged_returns',
          params: {
            input: { kind: 'module', module_ref: 'returns', output: 'value' },
            period: 1
          }
        }
      ]).resolved_feature_spec

      result = described_class.new(candles:, resolved_feature_spec: resolved).call

      expect(result.effective_window).to eq(3)
      expect(result.rows[2]).to include(complete: false, source_window_checksum: nil)
      expect(result.rows[3]).to include(complete: true)
      expect(result.rows[3][:features].fetch('lagged_returns')).to be_within(0.000001).of(Math.log(103.0 / 100.0))
      expect(result.rows[3][:source_window_checksum]).to match(/\A[0-9a-f]{64}\z/)
    end

    it 'checks cooperative cancellation before building module rows' do
      resolved = Ml::FeatureWindow.new(feature_spec: [ { type: 'log_return' } ]).resolved_feature_spec

      expect do
        described_class.new(candles:, resolved_feature_spec: resolved, cancel_check: Research::CancellationCheck.from_proc(-> { true })).call
      end.to raise_error(Research::Cancelled)
    end
  end
end
