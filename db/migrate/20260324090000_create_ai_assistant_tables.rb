# frozen_string_literal: true

class CreateAiAssistantTables < ActiveRecord::Migration[8.1]
  def change
    create_table :ai_models do |t|
      t.string :model_id, null: false
      t.string :name, null: false
      t.string :provider, null: false
      t.string :family
      t.datetime :model_created_at
      t.integer :context_window
      t.integer :max_output_tokens
      t.date :knowledge_cutoff
      t.jsonb :modalities, default: {}, null: false
      t.jsonb :capabilities, default: [], null: false
      t.jsonb :pricing, default: {}, null: false
      t.jsonb :metadata, default: {}, null: false
      t.timestamps
    end
    add_index :ai_models, [ :provider, :model_id ], unique: true
    add_index :ai_models, :provider
    add_index :ai_models, :family
    add_index :ai_models, :capabilities, using: :gin
    add_index :ai_models, :modalities, using: :gin

    create_table :ai_chats do |t|
      t.references :user, null: false, foreign_key: true
      t.references :ai_model, foreign_key: true
      t.string :title, null: false
      t.string :source_path
      t.string :system_id
      t.string :last_used_provider
      t.string :last_used_model
      t.timestamps
    end
    add_index :ai_chats, :updated_at
    add_index :ai_chats, [ :user_id, :source_path ]

    create_table :ai_messages do |t|
      t.references :ai_chat, null: false, foreign_key: true
      t.references :ai_model, foreign_key: true
      t.string :role, null: false
      t.text :content
      t.jsonb :content_raw
      t.jsonb :metadata, default: {}, null: false
      t.text :thinking_text
      t.text :thinking_signature
      t.integer :thinking_tokens
      t.integer :input_tokens
      t.integer :output_tokens
      t.integer :cached_tokens
      t.integer :cache_creation_tokens
      t.timestamps
    end
    add_index :ai_messages, :role

    create_table :ai_tool_calls do |t|
      t.references :ai_message, null: false, foreign_key: true
      t.string :tool_call_id, null: false
      t.string :name, null: false
      t.text :thought_signature
      t.jsonb :arguments, default: {}, null: false
      t.timestamps
    end
    add_index :ai_tool_calls, :tool_call_id, unique: true
    add_index :ai_tool_calls, :name

    add_reference :ai_messages, :ai_tool_call, foreign_key: true
  end
end
