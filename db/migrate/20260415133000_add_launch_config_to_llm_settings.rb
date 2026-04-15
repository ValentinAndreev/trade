# frozen_string_literal: true

class AddLaunchConfigToLlmSettings < ActiveRecord::Migration[8.1]
  def change
    add_column :llm_settings, :launch_config, :jsonb, null: false, default: {}
    add_column :llm_settings, :launch_state, :jsonb, null: false, default: {}
  end
end
