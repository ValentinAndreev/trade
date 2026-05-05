# frozen_string_literal: true

class AddOnDeleteToMlForeignKeys < ActiveRecord::Migration[8.1]
  def up
    remove_foreign_key :ml_models, column: :latest_successful_training_run_id
    remove_foreign_key :ml_models, column: :latest_failed_training_run_id

    add_foreign_key :ml_models, :ml_training_runs, column: :latest_successful_training_run_id, on_delete: :nullify
    add_foreign_key :ml_models, :ml_training_runs, column: :latest_failed_training_run_id, on_delete: :nullify
  end

  def down
    remove_foreign_key :ml_models, column: :latest_successful_training_run_id
    remove_foreign_key :ml_models, column: :latest_failed_training_run_id

    add_foreign_key :ml_models, :ml_training_runs, column: :latest_successful_training_run_id
    add_foreign_key :ml_models, :ml_training_runs, column: :latest_failed_training_run_id
  end
end
