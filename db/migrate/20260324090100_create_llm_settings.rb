# frozen_string_literal: true

class CreateLlmSettings < ActiveRecord::Migration[8.1]
  def change
    create_table :llm_settings do |t|
      t.references :user, null: false, foreign_key: true, index: { unique: true }
      t.string :provider, null: false, default: 'gemini'
      t.string :model, null: false, default: 'gemini-3-flash-preview'
      t.text :api_key
      t.string :api_base
      t.decimal :temperature, precision: 4, scale: 2, null: false, default: 0.2
      t.integer :max_output_tokens, null: false, default: 4000
      t.timestamps
    end
  end
end
