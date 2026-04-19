# frozen_string_literal: true

class CreateMacroSeries < ActiveRecord::Migration[8.1]
  disable_ddl_transaction!

  def up
    create_table :macro_series, id: false do |t|
      t.timestamptz :ts, null: false
      t.string :source, null: false
      t.string :indicator, null: false
      t.decimal :value, precision: 20, scale: 6, null: false
      t.timestamps
    end

    add_index :macro_series, %i[source indicator ts], unique: true,
      name: "index_macro_series_on_source_indicator_ts"

    execute "SELECT create_hypertable('macro_series', 'ts', chunk_time_interval => INTERVAL '6 months');"

    execute <<-SQL
      ALTER TABLE macro_series SET (
        timescaledb.compress,
        timescaledb.compress_segmentby = 'source,indicator',
        timescaledb.compress_orderby = 'ts DESC'
      );
    SQL

    execute "SELECT add_compression_policy('macro_series', INTERVAL '30 days');"
  end

  def down
    drop_table :macro_series
  end
end
