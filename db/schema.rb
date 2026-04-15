# This file is auto-generated from the current state of the database. Instead
# of editing this file, please use the migrations feature of Active Record to
# incrementally modify your database, and then regenerate this schema definition.
#
# This file is the source Rails uses to define your schema when running `bin/rails
# db:schema:load`. When creating a new database, `bin/rails db:schema:load` tends to
# be faster and is potentially less error prone than running all of your
# migrations from scratch. Old migrations may fail to apply correctly if those
# migrations use external dependencies or application code.
#
# It's strongly recommended that you check this file into your version control system.

ActiveRecord::Schema[8.1].define(version: 2026_04_15_180000) do
  # These are extensions that must be enabled in order to support this database
  enable_extension "pg_catalog.plpgsql"
  enable_extension "timescaledb"

  create_table "ai_chats", force: :cascade do |t|
    t.bigint "ai_model_id"
    t.datetime "created_at", null: false
    t.string "last_used_model"
    t.string "last_used_provider"
    t.string "source_path"
    t.string "system_id"
    t.string "title", null: false
    t.datetime "updated_at", null: false
    t.bigint "user_id", null: false
    t.index ["ai_model_id"], name: "index_ai_chats_on_ai_model_id"
    t.index ["updated_at"], name: "index_ai_chats_on_updated_at"
    t.index ["user_id", "source_path"], name: "index_ai_chats_on_user_id_and_source_path"
    t.index ["user_id"], name: "index_ai_chats_on_user_id"
  end

  create_table "ai_messages", force: :cascade do |t|
    t.bigint "ai_chat_id", null: false
    t.bigint "ai_model_id"
    t.bigint "ai_tool_call_id"
    t.integer "cache_creation_tokens"
    t.integer "cached_tokens"
    t.text "content"
    t.jsonb "content_raw"
    t.datetime "created_at", null: false
    t.integer "input_tokens"
    t.jsonb "metadata", default: {}, null: false
    t.integer "output_tokens"
    t.string "role", null: false
    t.text "thinking_signature"
    t.text "thinking_text"
    t.integer "thinking_tokens"
    t.datetime "updated_at", null: false
    t.index ["ai_chat_id"], name: "index_ai_messages_on_ai_chat_id"
    t.index ["ai_model_id"], name: "index_ai_messages_on_ai_model_id"
    t.index ["ai_tool_call_id"], name: "index_ai_messages_on_ai_tool_call_id"
    t.index ["role"], name: "index_ai_messages_on_role"
  end

  create_table "ai_models", force: :cascade do |t|
    t.jsonb "capabilities", default: [], null: false
    t.integer "context_window"
    t.datetime "created_at", null: false
    t.string "family"
    t.date "knowledge_cutoff"
    t.integer "max_output_tokens"
    t.jsonb "metadata", default: {}, null: false
    t.jsonb "modalities", default: {}, null: false
    t.datetime "model_created_at"
    t.string "model_id", null: false
    t.string "name", null: false
    t.jsonb "pricing", default: {}, null: false
    t.string "provider", null: false
    t.datetime "updated_at", null: false
    t.index ["capabilities"], name: "index_ai_models_on_capabilities", using: :gin
    t.index ["family"], name: "index_ai_models_on_family"
    t.index ["modalities"], name: "index_ai_models_on_modalities", using: :gin
    t.index ["provider", "model_id"], name: "index_ai_models_on_provider_and_model_id", unique: true
    t.index ["provider"], name: "index_ai_models_on_provider"
  end

  create_table "ai_tool_calls", force: :cascade do |t|
    t.bigint "ai_message_id", null: false
    t.jsonb "arguments", default: {}, null: false
    t.datetime "created_at", null: false
    t.string "name", null: false
    t.text "thought_signature"
    t.string "tool_call_id", null: false
    t.datetime "updated_at", null: false
    t.index ["ai_message_id"], name: "index_ai_tool_calls_on_ai_message_id"
    t.index ["name"], name: "index_ai_tool_calls_on_name"
    t.index ["tool_call_id"], name: "index_ai_tool_calls_on_tool_call_id", unique: true
  end

  create_table "candles", id: false, force: :cascade do |t|
    t.decimal "close", precision: 15, scale: 8, null: false
    t.datetime "created_at", null: false
    t.string "exchange", default: "bitfinex", null: false
    t.decimal "high", precision: 15, scale: 8, null: false
    t.decimal "low", precision: 15, scale: 8, null: false
    t.decimal "open", precision: 15, scale: 8, null: false
    t.string "symbol", null: false
    t.string "timeframe", default: "1m", null: false
    t.timestamptz "ts", null: false
    t.datetime "updated_at", null: false
    t.decimal "volume", precision: 25, scale: 8, null: false
    t.index ["symbol", "exchange", "ts"], name: "index_candles_on_symbol_exchange_ts", unique: true
    t.index ["ts"], name: "candles_ts_idx", order: :desc
  end

  create_table "llm_settings", force: :cascade do |t|
    t.string "api_base"
    t.text "api_key"
    t.datetime "created_at", null: false
    t.jsonb "launch_config", default: {}, null: false
    t.jsonb "launch_state", default: {}, null: false
    t.integer "max_output_tokens", default: 4000, null: false
    t.string "model", default: "gemini-3-flash-preview", null: false
    t.string "provider", default: "gemini", null: false
    t.decimal "temperature", precision: 4, scale: 2, default: "0.2", null: false
    t.datetime "updated_at", null: false
    t.bigint "user_id", null: false
    t.index ["user_id", "provider"], name: "index_llm_settings_on_user_id_and_provider", unique: true
  end

  create_table "presets", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.string "name", null: false
    t.jsonb "payload", default: {}, null: false
    t.datetime "updated_at", null: false
    t.bigint "user_id", null: false
    t.index ["user_id", "name"], name: "index_presets_on_user_id_and_name", unique: true
    t.index ["user_id"], name: "index_presets_on_user_id"
  end

  create_table "solid_cable_messages", force: :cascade do |t|
    t.binary "channel", null: false
    t.bigint "channel_hash", null: false
    t.datetime "created_at", null: false
    t.binary "payload", null: false
    t.index ["channel"], name: "index_solid_cable_messages_on_channel"
    t.index ["channel_hash"], name: "index_solid_cable_messages_on_channel_hash"
    t.index ["created_at"], name: "index_solid_cable_messages_on_created_at"
  end

  create_table "solid_cache_entries", force: :cascade do |t|
    t.integer "byte_size", null: false
    t.datetime "created_at", null: false
    t.binary "key", null: false
    t.bigint "key_hash", null: false
    t.binary "value", null: false
    t.index ["byte_size"], name: "index_solid_cache_entries_on_byte_size"
    t.index ["key_hash", "byte_size"], name: "index_solid_cache_entries_on_key_hash_and_byte_size"
    t.index ["key_hash"], name: "index_solid_cache_entries_on_key_hash", unique: true
  end

  create_table "solid_queue_blocked_executions", force: :cascade do |t|
    t.string "concurrency_key", null: false
    t.datetime "created_at", null: false
    t.datetime "expires_at", null: false
    t.bigint "job_id", null: false
    t.integer "priority", default: 0, null: false
    t.string "queue_name", null: false
    t.index ["concurrency_key", "priority", "job_id"], name: "index_solid_queue_blocked_executions_for_release"
    t.index ["expires_at", "concurrency_key"], name: "index_solid_queue_blocked_executions_for_maintenance"
    t.index ["job_id"], name: "index_solid_queue_blocked_executions_on_job_id", unique: true
  end

  create_table "solid_queue_claimed_executions", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.bigint "job_id", null: false
    t.bigint "process_id"
    t.index ["job_id"], name: "index_solid_queue_claimed_executions_on_job_id", unique: true
    t.index ["process_id", "job_id"], name: "index_solid_queue_claimed_executions_on_process_id_and_job_id"
  end

  create_table "solid_queue_failed_executions", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.text "error"
    t.bigint "job_id", null: false
    t.index ["job_id"], name: "index_solid_queue_failed_executions_on_job_id", unique: true
  end

  create_table "solid_queue_jobs", force: :cascade do |t|
    t.string "active_job_id"
    t.text "arguments"
    t.string "class_name", null: false
    t.string "concurrency_key"
    t.datetime "created_at", null: false
    t.datetime "finished_at"
    t.integer "priority", default: 0, null: false
    t.string "queue_name", null: false
    t.datetime "scheduled_at"
    t.datetime "updated_at", null: false
    t.index ["active_job_id"], name: "index_solid_queue_jobs_on_active_job_id"
    t.index ["class_name"], name: "index_solid_queue_jobs_on_class_name"
    t.index ["finished_at"], name: "index_solid_queue_jobs_on_finished_at"
    t.index ["queue_name", "finished_at"], name: "index_solid_queue_jobs_for_filtering"
    t.index ["scheduled_at", "finished_at"], name: "index_solid_queue_jobs_for_alerting"
  end

  create_table "solid_queue_pauses", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.string "queue_name", null: false
    t.index ["queue_name"], name: "index_solid_queue_pauses_on_queue_name", unique: true
  end

  create_table "solid_queue_processes", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.string "hostname"
    t.string "kind", null: false
    t.datetime "last_heartbeat_at", null: false
    t.text "metadata"
    t.string "name", null: false
    t.integer "pid", null: false
    t.bigint "supervisor_id"
    t.index ["last_heartbeat_at"], name: "index_solid_queue_processes_on_last_heartbeat_at"
    t.index ["name", "supervisor_id"], name: "index_solid_queue_processes_on_name_and_supervisor_id", unique: true
    t.index ["supervisor_id"], name: "index_solid_queue_processes_on_supervisor_id"
  end

  create_table "solid_queue_ready_executions", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.bigint "job_id", null: false
    t.integer "priority", default: 0, null: false
    t.string "queue_name", null: false
    t.index ["job_id"], name: "index_solid_queue_ready_executions_on_job_id", unique: true
    t.index ["priority", "job_id"], name: "index_solid_queue_poll_all"
    t.index ["queue_name", "priority", "job_id"], name: "index_solid_queue_poll_by_queue"
  end

  create_table "solid_queue_recurring_executions", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.bigint "job_id", null: false
    t.datetime "run_at", null: false
    t.string "task_key", null: false
    t.index ["job_id"], name: "index_solid_queue_recurring_executions_on_job_id", unique: true
    t.index ["task_key", "run_at"], name: "index_solid_queue_recurring_executions_on_task_key_and_run_at", unique: true
  end

  create_table "solid_queue_recurring_tasks", force: :cascade do |t|
    t.text "arguments"
    t.string "class_name"
    t.string "command", limit: 2048
    t.datetime "created_at", null: false
    t.text "description"
    t.string "key", null: false
    t.integer "priority", default: 0
    t.string "queue_name"
    t.string "schedule", null: false
    t.boolean "static", default: true, null: false
    t.datetime "updated_at", null: false
    t.index ["key"], name: "index_solid_queue_recurring_tasks_on_key", unique: true
    t.index ["static"], name: "index_solid_queue_recurring_tasks_on_static"
  end

  create_table "solid_queue_scheduled_executions", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.bigint "job_id", null: false
    t.integer "priority", default: 0, null: false
    t.string "queue_name", null: false
    t.datetime "scheduled_at", null: false
    t.index ["job_id"], name: "index_solid_queue_scheduled_executions_on_job_id", unique: true
    t.index ["scheduled_at", "priority", "job_id"], name: "index_solid_queue_dispatch_all"
  end

  create_table "solid_queue_semaphores", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.datetime "expires_at", null: false
    t.string "key", null: false
    t.datetime "updated_at", null: false
    t.integer "value", default: 1, null: false
    t.index ["expires_at"], name: "index_solid_queue_semaphores_on_expires_at"
    t.index ["key", "value"], name: "index_solid_queue_semaphores_on_key_and_value"
    t.index ["key"], name: "index_solid_queue_semaphores_on_key", unique: true
  end

  create_table "users", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.bigint "default_preset_id"
    t.string "password_digest", null: false
    t.datetime "updated_at", null: false
    t.string "username", null: false
    t.index ["default_preset_id"], name: "index_users_on_default_preset_id"
    t.index ["username"], name: "index_users_on_username", unique: true
  end

  add_foreign_key "ai_chats", "ai_models"
  add_foreign_key "ai_chats", "users"
  add_foreign_key "ai_messages", "ai_chats"
  add_foreign_key "ai_messages", "ai_models"
  add_foreign_key "ai_messages", "ai_tool_calls"
  add_foreign_key "ai_tool_calls", "ai_messages"
  add_foreign_key "llm_settings", "users"
  add_foreign_key "presets", "users"
  add_foreign_key "solid_queue_blocked_executions", "solid_queue_jobs", column: "job_id", on_delete: :cascade
  add_foreign_key "solid_queue_claimed_executions", "solid_queue_jobs", column: "job_id", on_delete: :cascade
  add_foreign_key "solid_queue_failed_executions", "solid_queue_jobs", column: "job_id", on_delete: :cascade
  add_foreign_key "solid_queue_ready_executions", "solid_queue_jobs", column: "job_id", on_delete: :cascade
  add_foreign_key "solid_queue_recurring_executions", "solid_queue_jobs", column: "job_id", on_delete: :cascade
  add_foreign_key "solid_queue_scheduled_executions", "solid_queue_jobs", column: "job_id", on_delete: :cascade
  add_foreign_key "users", "presets", column: "default_preset_id", on_delete: :nullify
end
