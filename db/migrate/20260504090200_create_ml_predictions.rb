# frozen_string_literal: true

class CreateMlPredictions < ActiveRecord::Migration[8.1]
  disable_ddl_transaction!

  def up
    create_table :ml_predictions, id: false do |t|
      t.timestamptz :ts, null: false
      t.bigint :ml_model_id, null: false
      t.bigint :ml_training_run_id, null: false
      t.string :exchange, null: false, default: 'bitfinex'
      t.string :symbol, null: false
      t.string :timeframe, null: false
      t.string :weight_checksum, null: false
      t.string :source_window_checksum, null: false
      t.string :output, null: false, default: 'probability'
      t.decimal :probability, precision: 12, scale: 10, null: false
      t.string :direction, null: false
      t.decimal :confidence, precision: 12, scale: 10, null: false
      t.timestamps
    end

    add_foreign_key :ml_predictions, :ml_models, column: :ml_model_id
    add_foreign_key :ml_predictions, :ml_training_runs, column: :ml_training_run_id
    add_index :ml_predictions, :ml_model_id
    add_index :ml_predictions, :ml_training_run_id
    add_index :ml_predictions, :weight_checksum
    add_index :ml_predictions, :source_window_checksum
    add_index :ml_predictions, :ts, order: { ts: :desc }, name: 'ml_predictions_ts_idx'
    add_index :ml_predictions,
      %i[ml_model_id exchange symbol timeframe ts],
      unique: true,
      name: 'index_ml_predictions_identity'
    add_check_constraint :ml_predictions,
      "output IN ('probability','direction','confidence')",
      name: 'chk_ml_predictions_output'
    add_check_constraint :ml_predictions,
      "direction IN ('up','down')",
      name: 'chk_ml_predictions_direction'
    add_check_constraint :ml_predictions,
      'probability >= 0 AND probability <= 1',
      name: 'chk_ml_predictions_probability'
    add_check_constraint :ml_predictions,
      'confidence >= 0 AND confidence <= 1',
      name: 'chk_ml_predictions_confidence'

    execute <<~SQL
      SELECT create_hypertable(
        'ml_predictions',
        'ts',
        chunk_time_interval => INTERVAL '3 months'
      );
    SQL
  end

  def down
    drop_table :ml_predictions
  end
end
