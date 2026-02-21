# frozen_string_literal: true

class CreateContinuousAggregates < ActiveRecord::Migration[8.1]
  disable_ddl_transaction!

  def up
    execute <<-SQL
      CREATE MATERIALIZED VIEW IF NOT EXISTS cagg_candles_5m
      WITH (timescaledb.continuous) AS
      SELECT
        time_bucket('5 minutes', ts) AS bucket,
        symbol,
        exchange,
        FIRST(open, ts) AS open,
        MAX(high) AS high,
        MIN(low) AS low,
        LAST(close, ts) AS close,
        SUM(volume) AS volume
      FROM candles
      GROUP BY bucket, symbol, exchange
      WITH NO DATA;
    SQL

    execute <<-SQL
      CREATE MATERIALIZED VIEW IF NOT EXISTS cagg_candles_15m
      WITH (timescaledb.continuous) AS
      SELECT
        time_bucket('15 minutes', ts) AS bucket,
        symbol,
        exchange,
        FIRST(open, ts) AS open,
        MAX(high) AS high,
        MIN(low) AS low,
        LAST(close, ts) AS close,
        SUM(volume) AS volume
      FROM candles
      GROUP BY bucket, symbol, exchange
      WITH NO DATA;
    SQL

    execute <<-SQL
      CREATE MATERIALIZED VIEW IF NOT EXISTS cagg_candles_1h
      WITH (timescaledb.continuous) AS
      SELECT
        time_bucket('1 hour', ts) AS bucket,
        symbol,
        exchange,
        FIRST(open, ts) AS open,
        MAX(high) AS high,
        MIN(low) AS low,
        LAST(close, ts) AS close,
        SUM(volume) AS volume
      FROM candles
      GROUP BY bucket, symbol, exchange
      WITH NO DATA;
    SQL

    execute <<-SQL
      CREATE MATERIALIZED VIEW IF NOT EXISTS cagg_candles_4h
      WITH (timescaledb.continuous) AS
      SELECT
        time_bucket('4 hours', ts) AS bucket,
        symbol,
        exchange,
        FIRST(open, ts) AS open,
        MAX(high) AS high,
        MIN(low) AS low,
        LAST(close, ts) AS close,
        SUM(volume) AS volume
      FROM candles
      GROUP BY bucket, symbol, exchange
      WITH NO DATA;
    SQL

    execute <<-SQL
      CREATE MATERIALIZED VIEW IF NOT EXISTS cagg_candles_1d
      WITH (timescaledb.continuous) AS
      SELECT
        time_bucket('1 day', ts) AS bucket,
        symbol,
        exchange,
        FIRST(open, ts) AS open,
        MAX(high) AS high,
        MIN(low) AS low,
        LAST(close, ts) AS close,
        SUM(volume) AS volume
      FROM candles
      GROUP BY bucket, symbol, exchange
      WITH NO DATA;
    SQL

    # Refresh policies
    execute <<-SQL
      SELECT add_continuous_aggregate_policy('cagg_candles_5m',
        start_offset => INTERVAL '24 hours',
        end_offset   => INTERVAL '5 minutes',
        schedule_interval => INTERVAL '1 minute');
    SQL

    execute <<-SQL
      SELECT add_continuous_aggregate_policy('cagg_candles_15m',
        start_offset => INTERVAL '48 hours',
        end_offset   => INTERVAL '5 minutes',
        schedule_interval => INTERVAL '1 minute');
    SQL

    execute <<-SQL
      SELECT add_continuous_aggregate_policy('cagg_candles_1h',
        start_offset => INTERVAL '7 days',
        end_offset   => INTERVAL '10 minutes',
        schedule_interval => INTERVAL '5 minutes');
    SQL

    execute <<-SQL
      SELECT add_continuous_aggregate_policy('cagg_candles_4h',
        start_offset => INTERVAL '21 days',
        end_offset   => INTERVAL '10 minutes',
        schedule_interval => INTERVAL '10 minutes');
    SQL

    execute <<-SQL
      SELECT add_continuous_aggregate_policy('cagg_candles_1d',
        start_offset => INTERVAL '90 days',
        end_offset   => INTERVAL '1 hour',
        schedule_interval => INTERVAL '30 minutes');
    SQL

    # Composite indexes for each aggregate view
    %w[cagg_candles_5m cagg_candles_15m cagg_candles_1h cagg_candles_4h cagg_candles_1d].each do |view_name|
      execute <<~SQL
        CREATE INDEX IF NOT EXISTS idx_#{view_name}_composite
        ON #{view_name} (symbol, exchange, bucket DESC)
        WITH (timescaledb.transaction_per_chunk);
      SQL
    end
  end

  def down
    %w[cagg_candles_5m cagg_candles_15m cagg_candles_1h cagg_candles_4h cagg_candles_1d].each do |view_name|
      execute "DROP INDEX IF EXISTS idx_#{view_name}_composite;"
    end

    execute "DROP MATERIALIZED VIEW IF EXISTS cagg_candles_1d"
    execute "DROP MATERIALIZED VIEW IF EXISTS cagg_candles_4h"
    execute "DROP MATERIALIZED VIEW IF EXISTS cagg_candles_1h"
    execute "DROP MATERIALIZED VIEW IF EXISTS cagg_candles_15m"
    execute "DROP MATERIALIZED VIEW IF EXISTS cagg_candles_5m"
  end
end
