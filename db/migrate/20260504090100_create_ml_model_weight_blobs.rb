# frozen_string_literal: true

class CreateMlModelWeightBlobs < ActiveRecord::Migration[8.1]
  def change
    create_table :ml_model_weight_blobs do |t|
      t.references :ml_training_run, null: false, foreign_key: true, index: { unique: true }
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
  end
end
