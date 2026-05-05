# frozen_string_literal: true

class Candle::FindQuery
  CONTINUOUS_AGGREGATES = {
    '5m' => 'cagg_candles_5m',
    '15m' => 'cagg_candles_15m',
    '1h' => 'cagg_candles_1h',
    '4h' => 'cagg_candles_4h',
    '1d' => 'cagg_candles_1d'
  }.freeze

  DEFAULT_LIMIT = 1500

  private attr_reader :symbol, :exchange, :timeframe, :start_time, :end_time, :limit, :connection, :preserve_decimals

  def initialize(symbol:, timeframe: '1m', exchange: 'bitfinex', start_time: nil, end_time: nil, limit: nil, preserve_decimals: false)
    @symbol = symbol
    @exchange = exchange
    @timeframe = timeframe
    @limit = limit&.to_i
    @preserve_decimals = preserve_decimals
    @end_time = parse_time(end_time) || Candle.max_ts(symbol:, exchange:)
    @start_time = parse_time(start_time) || calculate_start_time
    @connection = ActiveRecord::Base.connection
  end

  def call
    return [] unless start_time && end_time

    raw_data = if CONTINUOUS_AGGREGATES.key?(timeframe)
      read_from_aggregate
    elsif timeframe == '1m'
      read_raw_candles
    else
      calculate_on_the_fly
    end

    format_ohlcv(raw_data)
  end

  private

  def read_raw_candles
    params = [ symbol, exchange, start_time.iso8601, end_time.iso8601 ]
    connection.exec_query(<<-SQL.squish, 'FindCandles', params).to_a
      SELECT ts, open, high, low, close, volume
      FROM candles
      WHERE symbol = $1
        AND exchange = $2
        AND ts >= $3
        AND ts <= $4
      ORDER BY ts
    SQL
  end

  def read_from_aggregate
    table = CONTINUOUS_AGGREGATES[timeframe]
    params = [ symbol, exchange, start_time.iso8601, end_time.iso8601 ]
    connection.exec_query(<<-SQL.squish, 'FindCandles', params).to_a
      SELECT bucket AS ts, open, high, low, close, volume
      FROM #{table}
      WHERE symbol = $1
        AND exchange = $2
        AND bucket >= $3
        AND bucket <= $4
      ORDER BY bucket
    SQL
  end

  def calculate_on_the_fly
    parsed = parse_timeframe
    interval = "#{parsed.amount} #{parsed.interval_unit}"
    params = [ interval, symbol, exchange, start_time.iso8601, end_time.iso8601 ]
    connection.exec_query(<<-SQL.squish, 'FindCandles', params).to_a
      SELECT
        bucket AS ts,
        FIRST(open, ts) AS open,
        MAX(high) AS high,
        MIN(low) AS low,
        LAST(close, ts) AS close,
        SUM(volume) AS volume
      FROM (
        SELECT time_bucket($1, ts) AS bucket, ts, open, high, low, close, volume
        FROM candles
        WHERE symbol = $2
          AND exchange = $3
          AND ts >= $4
          AND ts <= $5
      ) bucketed_data
      GROUP BY bucket
      ORDER BY bucket
    SQL
  end

  def format_ohlcv(raw_data)
    raw_data.map do |candle|
      {
        time: candle['ts'].to_i,
        open: decimal_value(candle['open']),
        high: decimal_value(candle['high']),
        low: decimal_value(candle['low']),
        close: decimal_value(candle['close']),
        volume: decimal_value(candle['volume'])
      }
    end
  end

  def decimal_value(value)
    raise ArgumentError, 'Candle numeric value is missing' if value.nil? || value.to_s.blank?

    decimal = begin
      BigDecimal(value.to_s)
    rescue ArgumentError
      raise ArgumentError, "Invalid candle numeric value: #{value.inspect}"
    end
    preserve_decimals ? decimal : decimal.to_f
  end

  def calculate_start_time
    return Candle.min_ts(symbol:, exchange:) unless end_time

    count = limit || DEFAULT_LIMIT
    end_time - (count * parse_timeframe.duration_seconds)
  end

  def parse_timeframe
    TimeframeParser.parse(timeframe)
  end

  def parse_time(value)
    return nil if value.blank?
    value.is_a?(String) ? Time.zone.parse(value) : value.to_time.utc
  end
end
