class CreatePresets < ActiveRecord::Migration[8.1]
  def change
    create_table :presets do |t|
      t.references :user, null: false, foreign_key: true
      t.string :name, null: false
      t.jsonb :payload, null: false, default: {}
      t.boolean :is_default, null: false, default: false

      t.timestamps
    end
    add_index :presets, [:user_id, :name], unique: true
  end
end
