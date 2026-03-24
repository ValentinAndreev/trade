# frozen_string_literal: true

class MakeLlmSettingsPerProvider < ActiveRecord::Migration[8.0]
  def change
    remove_index :llm_settings, :user_id if index_exists?(:llm_settings, :user_id)
    add_index :llm_settings, %i[user_id provider], unique: true
  end
end
