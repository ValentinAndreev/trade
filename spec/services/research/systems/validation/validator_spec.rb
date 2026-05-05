# frozen_string_literal: true

require 'rails_helper'

RSpec.describe Research::Systems::Validation::Validator do
  describe '#call' do
    it 'treats empty yaml as invalid' do
      result = described_class.new('').call

      expect(result).to be_invalid
      expect(result.diagnostics.first.to_h).to include(
        message: 'System YAML is required',
        code: 'yaml_missing'
      )
    end

    it 'returns diagnostics with source location for unknown keys' do
      yaml = <<~YAML
        id: bad
        name: Broken
        modules:
          ema:
            type: ema
            period: 20
        params:
          position_mode: long_short
        conditions:
          long_entry: "close >> ema.value"
        unexpected: true
      YAML

      result = described_class.new(yaml).call

      expect(result).to be_invalid
      expect(result.diagnostics.first.to_h).to include(
        message: 'Unknown key: unexpected',
        line: 11,
        column: 1
      )
    end

    it 'rejects unsupported module types' do
      yaml = <<~YAML
        id: bad
        name: Broken
        modules:
          fast:
            type: wave
            period: 20
        conditions:
          long_entry: "close >> fast.value"
      YAML

      result = described_class.new(yaml).call

      expect(result).to be_invalid
      expect(result.diagnostics.map(&:message)).to include('Unsupported module type: wave')
    end

    it 'requires type for every module alias' do
      yaml = <<~YAML
        id: bad
        name: Broken
        modules:
          ema_fast:
            period: 10
          ema_slow:
            type: ema
            period: 20
        conditions:
          long_entry: "ema_fast.value >> ema_slow.value"
      YAML

      result = described_class.new(yaml).call

      expect(result).to be_invalid
      expect(result.diagnostics.map(&:message)).to include('Missing required key: type')
    end

    it 'validates references nested inside arithmetic expressions' do
      yaml = <<~YAML
        id: bad
        name: Broken
        modules:
          ema_fast:
            type: ema
            period: 10
        params:
          position_mode: long_short
        conditions:
          long_entry: "close > ema_fast.value + missing.value"
      YAML

      result = described_class.new(yaml).call

      expect(result).to be_invalid
      expect(result.diagnostics.map(&:message)).to include('Unknown module reference: missing.value')
    end

    it 'validates references nested inside helper function calls' do
      yaml = <<~YAML
        id: bad
        name: Broken
        modules:
          ema_fast:
            type: ema
            period: 10
        params:
          position_mode: long_short
        conditions:
          long_entry: "abs(offset(missing.value, 2) - ema_fast.value) > 5"
      YAML

      result = described_class.new(yaml).call

      expect(result).to be_invalid
      expect(result.diagnostics.map(&:message)).to include('Unknown module reference: missing.value')
    end

    it 'rejects condition expressions with non-boolean logical branches' do
      yaml = <<~YAML
        id: bad
        name: Broken
        modules:
          ema_fast:
            type: ema
            period: 10
        params:
          position_mode: long_short
        conditions:
          long_entry: "close > ema_fast.value && close"
      YAML

      result = described_class.new(yaml).call

      expect(result).to be_invalid
      expect(result.diagnostics.map(&:message)).to include('Condition expressions must evaluate to a boolean comparison')
    end

    it 'accepts external_series module references' do
      yaml = <<~YAML
        id: external_series_filter
        name: External Series Filter
        modules:
          mvrv:
            type: external_series
            key: mvrv_z_score
        params:
          position_mode: long_only
          upper_threshold: 7
        conditions:
          long_entry: "mvrv.value < params.upper_threshold"
      YAML

      result = described_class.new(yaml).call

      expect(result).to be_valid
    end

    it 'rejects bb standard_deviations below schema minimum' do
      yaml = <<~YAML
        id: bb_bad_stddev
        name: BB Bad StdDev
        modules:
          band:
            type: bb
            period: 20
            standard_deviations: 0
        conditions:
          long_entry: "band.value > 0"
      YAML

      result = described_class.new(yaml).call

      expect(result).to be_invalid
      expect(result.diagnostics.map(&:message)).to include(a_string_matching(/>=.*0\.1/))
    end

    it 'rejects external_series without required key' do
      yaml = <<~YAML
        id: external_series_missing_key
        name: External Series Missing Key
        modules:
          ext:
            type: external_series
        conditions:
          long_entry: "ext.value > 0"
      YAML

      result = described_class.new(yaml).call

      expect(result).to be_invalid
      expect(result.diagnostics.map(&:message)).to include('Missing required key: key')
    end

    it 'accepts trained ml_signal model references without enumerating model keys in the schema' do
      create_trained_ml_model(key: 'btc_direction_v1')
      yaml = ml_signal_yaml(model_key: 'btc_direction_v1', output: 'confidence')

      result = described_class.new(yaml, dataset: ml_dataset).call

      expect(result).to be_valid
      expect(Research::Systems::Schema.data.dig('modules', 'types', 'ml_signal', 'params', 'model_key')).to include(
        'type' => 'string',
        'required' => true
      )
    end

    it 'rejects unknown ml_signal model references' do
      result = described_class.new(ml_signal_yaml(model_key: 'missing_model'), dataset: ml_dataset).call

      expect(result).to be_invalid
      expect(result.diagnostics.map(&:message)).to include('Unknown ML model: missing_model')
    end

    it 'rejects untrained ml_signal model references' do
      create(:ml_model, key: 'draft_direction_model', serving_status: 'draft')

      result = described_class.new(ml_signal_yaml(model_key: 'draft_direction_model'), dataset: ml_dataset).call

      expect(result).to be_invalid
      expect(result.diagnostics.map(&:message)).to include('ML model is not trained: draft_direction_model')
    end

    it 'rejects unsupported ml_signal outputs' do
      create_trained_ml_model(key: 'btc_direction_v1')

      result = described_class.new(ml_signal_yaml(model_key: 'btc_direction_v1', output: 'score'), dataset: ml_dataset).call

      expect(result).to be_invalid
      expect(result.diagnostics.map(&:message)).to include('Unsupported ML output: score')
    end

    it 'rejects ml_signal models with missing feature metadata' do
      create_trained_ml_model(
        key: 'metadata_gap_model',
        resolved_feature_spec: [ { 'type' => 'log_return', 'lookahead' => 0 } ]
      )

      result = described_class.new(ml_signal_yaml(model_key: 'metadata_gap_model'), dataset: ml_dataset).call

      expect(result).to be_invalid
      expect(result.diagnostics.map(&:message)).to include(a_string_matching(/missing metadata/))
    end

    it 'rejects ml_signal models with positive-lookahead features' do
      resolved = Ml::FeatureWindow.new(feature_spec: [ { type: 'log_return', params: { period: 1 } } ]).resolved_feature_spec
      resolved.first['lookahead'] = 1
      create_trained_ml_model(key: 'lookahead_model', resolved_feature_spec: resolved)

      result = described_class.new(ml_signal_yaml(model_key: 'lookahead_model'), dataset: ml_dataset).call

      expect(result).to be_invalid
      expect(result.diagnostics.map(&:message)).to include('ML model lookahead_model uses positive-lookahead feature 0')
    end

    it 'rejects ml_signal models trained for a different symbol or timeframe' do
      create_trained_ml_model(key: 'eth_direction_v1', symbol: 'ETHUSD', timeframe: '5m')

      result = described_class.new(ml_signal_yaml(model_key: 'eth_direction_v1'), dataset: ml_dataset).call

      expect(result).to be_invalid
      expect(result.diagnostics.map(&:message)).to include(a_string_matching(/incompatible with dataset/))
    end
  end

  def ml_dataset
    {
      symbol: 'BTCUSD',
      exchange: 'bitfinex',
      timeframe: '1m'
    }
  end

  def ml_signal_yaml(model_key:, output: 'probability')
    <<~YAML
      id: ml_signal_system
      name: ML Signal System
      modules:
        signal:
          type: ml_signal
          model_key: #{model_key}
          output: #{output}
      conditions:
        long_entry: "signal.value > 0.6"
    YAML
  end

  def create_trained_ml_model(key:, symbol: 'BTCUSD', exchange: 'bitfinex', timeframe: '1m', resolved_feature_spec: nil)
    model = create(:ml_model, key:, serving_status: 'draft')
    resolved_feature_spec ||= Ml::FeatureWindow.new(feature_spec: [ { type: 'log_return', params: { period: 1 } } ]).resolved_feature_spec
    run = create(
      :ml_training_run,
      :succeeded,
      ml_model: model,
      dataset_spec: {
        symbol:,
        exchange:,
        timeframe:,
        label_horizon: 1
      },
      resolved_feature_spec:
    )
    model.update!(
      serving_status: 'trained',
      latest_successful_training_run: run,
      serving_weight_checksum: run.weight_checksum
    )
    model
  end
end
