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

ActiveRecord::Schema[8.1].define(version: 2026_05_04_090200) do
  # These are extensions that must be enabled in order to support this database
  enable_extension "pg_catalog.plpgsql"
  enable_extension "timescaledb"

  create_table "ai_chats", force: :cascade do |t|
    t.bigint "ai_model_id"
    t.datetime "created_at", null: false
    t.string "last_used_model"
    t.string "last_used_provider"
    t.string "title", null: false
    t.datetime "updated_at", null: false
    t.bigint "user_id", null: false
    t.index ["ai_model_id"], name: "index_ai_chats_on_ai_model_id"
    t.index ["updated_at"], name: "index_ai_chats_on_updated_at"
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

  create_table "macro_series", id: false, force: :cascade do |t|
    t.datetime "created_at", null: false
    t.string "indicator", null: false
    t.string "source", null: false
    t.timestamptz "ts", null: false
    t.datetime "updated_at", null: false
    t.decimal "value", precision: 20, scale: 6, null: false
    t.index ["source", "indicator", "ts"], name: "index_macro_series_on_source_indicator_ts", unique: true
    t.index ["ts"], name: "macro_series_ts_idx", order: :desc
  end

  create_table "ml_model_weight_blobs", force: :cascade do |t|
    t.integer "byte_size", null: false
    t.string "checksum", null: false
    t.datetime "created_at", null: false
    t.bigint "ml_training_run_id", null: false
    t.datetime "updated_at", null: false
    t.string "weights_format", null: false
    t.binary "weights_payload", null: false
    t.index ["checksum"], name: "index_ml_model_weight_blobs_on_checksum", unique: true
    t.index ["ml_training_run_id"], name: "index_ml_model_weight_blobs_on_ml_training_run_id", unique: true
    t.index ["weights_format"], name: "index_ml_model_weight_blobs_on_weights_format"
    t.check_constraint "byte_size > 0 AND byte_size <= 16777216", name: "chk_ml_model_weight_blobs_byte_size"
  end

  create_table "ml_models", force: :cascade do |t|
    t.string "architecture", null: false
    t.datetime "created_at", null: false
    t.string "display_name", null: false
    t.string "key", null: false
    t.bigint "latest_failed_training_run_id"
    t.bigint "latest_successful_training_run_id"
    t.jsonb "metric_summary", default: {}, null: false
    t.string "prediction_target", default: "direction_classification", null: false
    t.string "serving_status", default: "draft", null: false
    t.string "serving_weight_checksum"
    t.datetime "updated_at", null: false
    t.index ["architecture"], name: "index_ml_models_on_architecture"
    t.index ["key"], name: "index_ml_models_on_key", unique: true
    t.index ["latest_failed_training_run_id"], name: "index_ml_models_on_latest_failed_training_run_id"
    t.index ["latest_successful_training_run_id"], name: "index_ml_models_on_latest_successful_training_run_id"
    t.index ["metric_summary"], name: "index_ml_models_on_metric_summary", using: :gin
    t.index ["prediction_target"], name: "index_ml_models_on_prediction_target"
    t.index ["serving_status"], name: "index_ml_models_on_serving_status"
  end

  create_table "ml_predictions", id: false, force: :cascade do |t|
    t.decimal "confidence", precision: 12, scale: 10, null: false
    t.datetime "created_at", null: false
    t.string "direction", null: false
    t.string "exchange", default: "bitfinex", null: false
    t.bigint "ml_model_id", null: false
    t.bigint "ml_training_run_id", null: false
    t.string "output", default: "probability", null: false
    t.decimal "probability", precision: 12, scale: 10, null: false
    t.string "source_window_checksum", null: false
    t.string "symbol", null: false
    t.string "timeframe", null: false
    t.timestamptz "ts", null: false
    t.datetime "updated_at", null: false
    t.string "weight_checksum", null: false
    t.index ["ml_model_id", "exchange", "symbol", "timeframe", "ts"], name: "index_ml_predictions_identity", unique: true
    t.index ["ml_model_id"], name: "index_ml_predictions_on_ml_model_id"
    t.index ["ml_training_run_id"], name: "index_ml_predictions_on_ml_training_run_id"
    t.index ["source_window_checksum"], name: "index_ml_predictions_on_source_window_checksum"
    t.index ["ts"], name: "ml_predictions_ts_idx", order: :desc
    t.index ["weight_checksum"], name: "index_ml_predictions_on_weight_checksum"
    t.check_constraint "confidence >= 0::numeric AND confidence <= 1::numeric", name: "chk_ml_predictions_confidence"
    t.check_constraint "direction::text = ANY (ARRAY['up'::character varying, 'down'::character varying]::text[])", name: "chk_ml_predictions_direction"
    t.check_constraint "output::text = ANY (ARRAY['probability'::character varying, 'direction'::character varying, 'confidence'::character varying]::text[])", name: "chk_ml_predictions_output"
    t.check_constraint "probability >= 0::numeric AND probability <= 1::numeric", name: "chk_ml_predictions_probability"
  end

  create_table "ml_training_runs", force: :cascade do |t|
    t.datetime "cancellation_requested_at"
    t.datetime "created_at", null: false
    t.jsonb "dataset_spec", default: {}, null: false
    t.integer "duration_ms"
    t.jsonb "error_metadata", default: {}, null: false
    t.datetime "finished_at"
    t.jsonb "fitted_metadata", default: {}, null: false
    t.datetime "heartbeat_at"
    t.jsonb "hyperparams", default: {}, null: false
    t.jsonb "metrics", default: {}, null: false
    t.bigint "ml_model_id", null: false
    t.jsonb "resolved_feature_spec", default: [], null: false
    t.integer "seed", default: 0, null: false
    t.datetime "started_at"
    t.string "status", default: "queued", null: false
    t.datetime "updated_at", null: false
    t.string "weight_checksum"
    t.index ["cancellation_requested_at"], name: "index_ml_training_runs_on_cancellation_requested_at"
    t.index ["error_metadata"], name: "index_ml_training_runs_on_error_metadata", using: :gin
    t.index ["heartbeat_at"], name: "index_ml_training_runs_on_heartbeat_at"
    t.index ["metrics"], name: "index_ml_training_runs_on_metrics", using: :gin
    t.index ["ml_model_id"], name: "index_ml_training_runs_on_ml_model_id"
    t.index ["ml_model_id"], name: "index_ml_training_runs_one_active_per_model", unique: true, where: "((status)::text = ANY ((ARRAY['queued'::character varying, 'running'::character varying])::text[]))"
    t.index ["status"], name: "index_ml_training_runs_on_status"
    t.index ["weight_checksum"], name: "index_ml_training_runs_on_weight_checksum"
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
  add_foreign_key "ml_model_weight_blobs", "ml_training_runs"
  add_foreign_key "ml_models", "ml_training_runs", column: "latest_failed_training_run_id"
  add_foreign_key "ml_models", "ml_training_runs", column: "latest_successful_training_run_id"
  add_foreign_key "ml_predictions", "ml_models"
  add_foreign_key "ml_predictions", "ml_training_runs"
  add_foreign_key "ml_training_runs", "ml_models"
  add_foreign_key "presets", "users"
  add_foreign_key "solid_queue_blocked_executions", "solid_queue_jobs", column: "job_id", on_delete: :cascade
  add_foreign_key "solid_queue_claimed_executions", "solid_queue_jobs", column: "job_id", on_delete: :cascade
  add_foreign_key "solid_queue_failed_executions", "solid_queue_jobs", column: "job_id", on_delete: :cascade
  add_foreign_key "solid_queue_ready_executions", "solid_queue_jobs", column: "job_id", on_delete: :cascade
  add_foreign_key "solid_queue_recurring_executions", "solid_queue_jobs", column: "job_id", on_delete: :cascade
  add_foreign_key "solid_queue_scheduled_executions", "solid_queue_jobs", column: "job_id", on_delete: :cascade
  add_foreign_key "users", "presets", column: "default_preset_id", on_delete: :nullify
end
