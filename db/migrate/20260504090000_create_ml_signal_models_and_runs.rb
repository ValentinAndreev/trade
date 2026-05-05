# frozen_string_literal: true

class CreateMlSignalModelsAndRuns < ActiveRecord::Migration[8.1]
  def change
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
  end
end
