# frozen_string_literal: true

class ConvertCandlesToHypertable < ActiveRecord::Migration[8.1]
  def up
    execute <<-SQL
      SELECT create_hypertable(
        'candles',
        'ts',
        chunk_time_interval => INTERVAL '3 months'
      );
    SQL

    execute <<-SQL
      ALTER TABLE candles SET (
        timescaledb.compress,
        timescaledb.compress_segmentby = 'symbol,exchange',
        timescaledb.compress_orderby = 'ts DESC'
      );
    SQL

    execute <<-SQL
      SELECT add_compression_policy('candles', INTERVAL '7 days');
    SQL
  end

  def down
    raise ActiveRecord::IrreversibleMigration,
      "Cannot revert hypertable. Restore from backup if needed."
  end
end
