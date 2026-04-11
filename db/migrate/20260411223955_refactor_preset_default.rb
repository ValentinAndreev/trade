# frozen_string_literal: true

class RefactorPresetDefault < ActiveRecord::Migration[8.0]
  def up
    add_reference :users, :default_preset, foreign_key: { to_table: :presets, on_delete: :nullify }, null: true

    execute <<~SQL
      UPDATE users
      SET default_preset_id = presets.id
      FROM presets
      WHERE presets.user_id = users.id AND presets.is_default = true
    SQL

    remove_column :presets, :is_default
  end

  def down
    add_column :presets, :is_default, :boolean, null: false, default: false

    execute <<~SQL
      UPDATE presets
      SET is_default = true
      FROM users
      WHERE users.default_preset_id = presets.id
    SQL

    remove_reference :users, :default_preset
  end
end
