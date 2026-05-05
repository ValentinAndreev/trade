# frozen_string_literal: true

require 'rails_helper'

RSpec.describe MlPrediction, type: :model do
  before(:context) do
    self.class.ensure_ml_predictions_hypertable!
  end

  describe 'table shape' do
    it 'has no standalone ActiveRecord primary key' do
      expect(described_class.primary_key).to be_nil
      expect(described_class.column_names).not_to include('id')
    end

    it 'does not support id-based find' do
      expect { described_class.find(1) }.to raise_error(ActiveRecord::UnknownPrimaryKey)
    end

    it 'is a Timescale hypertable partitioned by timestamp' do
      hypertables = ActiveRecord::Base.connection.select_values(
        "SELECT hypertable_name FROM timescaledb_information.hypertables WHERE hypertable_name = 'ml_predictions'"
      )

      expect(hypertables).to include('ml_predictions')
    end

    it 'keeps every unique index timestamp-qualified' do
      unique_indexes = ActiveRecord::Base.connection.indexes(:ml_predictions).select(&:unique)

      expect(unique_indexes).not_to be_empty
      expect(unique_indexes).to all(satisfy { |index| index.columns.include?('ts') })
    end
  end

  describe 'validations' do
    it 'is valid with default factory attributes' do
      expect(build(:ml_prediction)).to be_valid
    end

    it 'requires a supported output field' do
      prediction = build(:ml_prediction, output: 'score')

      expect(prediction).not_to be_valid
      expect(prediction.errors[:output]).to be_present
    end

    it 'requires a supported direction' do
      prediction = build(:ml_prediction, direction: 'flat')

      expect(prediction).not_to be_valid
      expect(prediction.errors[:direction]).to be_present
    end

    it 'bounds probability and confidence values' do
      prediction = build(:ml_prediction, probability: 1.1, confidence: -0.1)

      expect(prediction).not_to be_valid
      expect(prediction.errors[:probability]).to be_present
      expect(prediction.errors[:confidence]).to be_present
    end
  end

  describe '.upsert_predictions' do
    it 'inserts prediction rows through the identity index' do
      record = prediction_record(probability: 0.62)

      expect { described_class.upsert_predictions([ record ]) }
        .to change(described_class, :count).by(1)
    end

    it 'replaces an existing identity row instead of appending stale copies' do
      record = prediction_record(probability: 0.62)
      described_class.upsert_predictions([ record ])

      expect do
        described_class.upsert_predictions([ record.merge(probability: 0.71, confidence: 0.42) ])
      end.not_to change(described_class, :count)

      prediction = described_class.find_by!(
        ml_model_id: record[:ml_model_id],
        exchange: record[:exchange],
        symbol: record[:symbol],
        timeframe: record[:timeframe],
        ts: record[:ts]
      )
      expect(prediction.probability).to eq(0.71)
      expect(prediction.confidence).to eq(0.42)
    end
  end

  def prediction_record(overrides = {})
    model = create(:ml_model)
    run = create(:ml_training_run, :succeeded, ml_model: model)
    {
      ts: Time.utc(2026, 1, 1, 0, 0, 0),
      ml_model_id: model.id,
      ml_training_run_id: run.id,
      exchange: 'bitfinex',
      symbol: 'BTCUSD',
      timeframe: '1h',
      weight_checksum: run.weight_checksum,
      source_window_checksum: 'source-window-sha256',
      output: 'probability',
      probability: 0.62,
      direction: 'up',
      confidence: 0.24
    }.merge(overrides)
  end

  def self.ensure_ml_predictions_hypertable!
    connection = ActiveRecord::Base.connection
    exists = connection.select_value(
      "SELECT COUNT(*) FROM timescaledb_information.hypertables WHERE hypertable_name = 'ml_predictions'"
    ).to_i.positive?
    return if exists

    connection.execute(<<~SQL)
      SELECT create_hypertable(
        'ml_predictions',
        'ts',
        chunk_time_interval => INTERVAL '3 months',
        if_not_exists => TRUE
      );
    SQL
  end
end
