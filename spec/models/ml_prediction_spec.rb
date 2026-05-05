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

  describe 'write invariants' do
    it 'keeps repository-managed prediction constraints in the database' do
      expect(described_class.validators).to be_empty

      prediction = build(:ml_prediction, direction: 'flat')
      expect { prediction.save!(validate: false) }.to raise_error(ActiveRecord::StatementInvalid)
    end
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
