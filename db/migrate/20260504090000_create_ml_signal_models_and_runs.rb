# frozen_string_literal: true

class CreateMlSignalModelsAndRuns < ActiveRecord::Migration[8.1]
  disable_ddl_transaction!

  def up
    create_table :ml_models do |t|
      t.string :key, null: false
      t.string :display_name, null: false
      t.string :architecture, null: false
      t.string :prediction_target, null: false, default: 'direction_classification'
      t.string :serving_status, null: false, default: 'draft'
      t.bigint :latest_successful_training_run_id
      t.bigint :latest_failed_training_run_id
      t.jsonb :metric_summary, default: {}, null: false
      t.string :serving_weight_checksum
      t.timestamps
    end

    add_index :ml_models, :key, unique: true
    add_index :ml_models, :architecture
    add_index :ml_models, :prediction_target
    add_index :ml_models, :serving_status
    add_index :ml_models, :latest_successful_training_run_id
    add_index :ml_models, :latest_failed_training_run_id
    add_index :ml_models, :metric_summary, using: :gin

    create_table :ml_training_runs do |t|
      t.references :ml_model, null: false, foreign_key: true
      t.string :status, null: false, default: 'queued'
      t.jsonb :dataset_spec, default: {}, null: false
      t.jsonb :resolved_feature_spec, default: [], null: false
      t.jsonb :hyperparams, default: {}, null: false
      t.integer :seed, null: false, default: 0
      t.jsonb :metrics, default: {}, null: false
      t.jsonb :error_metadata, default: {}, null: false
      t.datetime :heartbeat_at
      t.datetime :cancellation_requested_at
      t.string :weight_checksum
      t.jsonb :fitted_metadata, default: {}, null: false
      t.datetime :started_at
      t.datetime :finished_at
      t.integer :duration_ms
      t.timestamps
    end

    add_index :ml_training_runs, :status
    add_index :ml_training_runs, :heartbeat_at
    add_index :ml_training_runs, :cancellation_requested_at
    add_index :ml_training_runs, :weight_checksum
    add_index :ml_training_runs, :metrics, using: :gin
    add_index :ml_training_runs, :error_metadata, using: :gin
    add_index :ml_training_runs, :ml_model_id,
      unique: true,
      where: "status IN ('queued','running')",
      name: 'index_ml_training_runs_one_active_per_model'

    add_foreign_key :ml_models, :ml_training_runs, column: :latest_successful_training_run_id
    add_foreign_key :ml_models, :ml_training_runs, column: :latest_failed_training_run_id

    create_table :ml_model_weight_blobs do |t|
      t.string :weights_format, null: false
      t.binary :weights_payload, null: false
      t.integer :byte_size, null: false
      t.string :checksum, null: false
      t.timestamps
    end

    add_index :ml_model_weight_blobs, :weights_format
    add_index :ml_model_weight_blobs, :checksum, unique: true
    add_check_constraint :ml_model_weight_blobs,
      'byte_size > 0 AND byte_size <= 16777216',
      name: 'chk_ml_model_weight_blobs_byte_size'

    create_table :ml_predictions, id: false do |t|
      t.timestamptz :ts, null: false
      t.bigint :ml_model_id, null: false
      t.bigint :ml_training_run_id, null: false
      t.string :exchange, null: false, default: 'bitfinex'
      t.string :symbol, null: false
      t.string :timeframe, null: false
      t.string :weight_checksum, null: false
      t.string :source_window_checksum, null: false
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
      %i[ml_model_id exchange symbol timeframe ts weight_checksum],
      unique: true,
      name: 'index_ml_predictions_identity'
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
    drop_table :ml_model_weight_blobs
    remove_foreign_key :ml_models, column: :latest_failed_training_run_id
    remove_foreign_key :ml_models, column: :latest_successful_training_run_id
    drop_table :ml_training_runs
    drop_table :ml_models
  end
end
