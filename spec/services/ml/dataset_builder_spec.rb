# frozen_string_literal: true

require 'rails_helper'

RSpec.describe Ml::DatasetBuilder do
  let(:start_time) { Time.utc(2026, 1, 1) }
  let(:closes) { [ 100.0, 101.0, 101.0, 99.0, 99.0, 101.0 ] }
  let(:candles) do
    closes.map.with_index do |close, index|
      {
        time: (start_time + index.minutes).to_i,
        open: close,
        high: close + 1.0,
        low: close - 1.0,
        close:,
        volume: 10.0 + index
      }
    end
  end
  let(:feature_spec) { [ { type: 'log_return', params: { period: 1 } } ] }

  subject(:builder) do
    described_class.new(
      symbol: 'BTCUSD',
      exchange: 'bitfinex',
      timeframe: '1m',
      candles:,
      feature_spec:,
      dataset_spec: { label_horizon: 1 },
      hyperparams: { label_deadband_return: 0.0 }
    )
  end

  describe '#build_training' do
    it 'builds deterministic examples with non-leaking future direction labels' do
      result = builder.build_training

      expect(result.dataset_spec).to include(
        'symbol' => 'BTCUSD',
        'exchange' => 'bitfinex',
        'timeframe' => '1m',
        'label_horizon' => 1,
        'label_deadband_return' => 0.0
      )
      expect(result.feature_names).to eq([ 'log_return' ])
      expect(result.examples.map { |example| example[:time] }).to eq([
        (start_time + 2.minutes).to_i,
        (start_time + 4.minutes).to_i
      ])
      expect(result.examples.map { |example| example[:label] }).to eq(%w[down up])

      first_example = result.examples.first
      expect(first_example[:features].fetch('log_return')).to eq(0.0)
      expect(first_example[:label_return]).to be_within(0.000001).of((99.0 / 101.0) - 1.0)
      expect(first_example[:source_window_checksum]).to match(/\A[0-9a-f]{64}\z/)
    end

    it 'counts warmup, missing future labels and deadband rows in diagnostics' do
      result = builder.build_training

      expect(result.diagnostics).to include(
        'candle_count' => 6,
        'effective_window' => 1,
        'training_examples' => 2,
        'insufficient_history_rows' => 1,
        'missing_future_label_rows' => 1,
        'deadband_rows' => 2,
        'invalid_label_rows' => 0
      )
    end

    it 'raises structured feature-spec errors before training examples are built' do
      bad_builder = described_class.new(
        symbol: 'BTCUSD',
        timeframe: '1m',
        candles:,
        feature_spec: [ { type: 'sma', params: { period: 2 } } ]
      )

      expect { bad_builder.build_training }.to raise_error(Ml::FeatureWindow::Error) do |error|
        expect(error.code).to eq(:missing_metadata)
      end
    end
  end

  describe '#build_inference' do
    it 'returns candle-aligned rows with nil source checksums during warmup' do
      result = described_class.new(
        symbol: 'BTCUSD',
        timeframe: '1m',
        candles:,
        feature_spec: [ { type: 'log_return', params: { period: 2 } } ]
      ).build_inference

      expect(result.rows.length).to eq(candles.length)
      expect(result.examples).to be_empty
      expect(result.rows[0]).to include(complete: false, source_window_checksum: nil)
      expect(result.rows[1]).to include(complete: false, source_window_checksum: nil)
      expect(result.rows[2]).to include(complete: true)
      expect(result.rows[2][:features].fetch('log_return')).to be_within(0.000001).of(Math.log(101.0 / 100.0))
    end
  end
end
