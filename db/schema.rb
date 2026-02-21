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

ActiveRecord::Schema[8.1].define(version: 2026_02_21_000004) do
  # These are extensions that must be enabled in order to support this database
  enable_extension "pg_catalog.plpgsql"
  enable_extension "timescaledb"

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
end
