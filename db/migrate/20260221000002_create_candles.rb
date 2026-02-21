# frozen_string_literal: true

class CreateCandles < ActiveRecord::Migration[8.1]
  def change
    create_table :candles, id: false do |t|
      t.timestamptz :ts, null: false
      t.string :symbol, null: false
      t.string :exchange, null: false, default: "bitfinex"
      t.string :timeframe, null: false, default: "1m"
      t.decimal :open, precision: 15, scale: 8, null: false
      t.decimal :high, precision: 15, scale: 8, null: false
      t.decimal :low, precision: 15, scale: 8, null: false
      t.decimal :close, precision: 15, scale: 8, null: false
      t.decimal :volume, precision: 25, scale: 8, null: false
      t.timestamps
    end

    add_index :candles, [ :symbol, :exchange, :ts ], unique: true, name: "index_candles_on_symbol_exchange_ts"
  end
end
