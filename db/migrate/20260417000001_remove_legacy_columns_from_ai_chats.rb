# frozen_string_literal: true

class RemoveLegacyColumnsFromAiChats < ActiveRecord::Migration[8.1]
  def change
    remove_index :ai_chats, name: "index_ai_chats_on_user_id_and_source_path", if_exists: true
    remove_column :ai_chats, :source_path, :string
    remove_column :ai_chats, :system_id, :string
  end
end
