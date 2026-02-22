# frozen_string_literal: true

class Candle::FindQuery
  CONTINUOUS_AGGREGATES = {
    '5m' => 'cagg_candles_5m',
    '15m' => 'cagg_candles_15m',
    '1h' => 'cagg_candles_1h',
    '4h' => 'cagg_candles_4h',
    '1d' => 'cagg_candles_1d'
  }.freeze

  TIMEFRAMES = {
    'm' => { unit: 'minutes', duration: 1.minute },
    'h' => { unit: 'hours',   duration: 1.hour },
    'd' => { unit: 'days',    duration: 1.day },
    'w' => { unit: 'weeks',   duration: 1.week }
  }.freeze

  DEFAULT_LIMIT = 1500

  private attr_reader :symbol, :exchange, :timeframe, :start_time, :end_time, :limit, :connection

  def initialize(symbol:, timeframe: '1m', exchange: 'bitfinex', start_time: nil, end_time: nil, limit: nil)
    @symbol = symbol
    @exchange = exchange
    @timeframe = timeframe
    @limit = limit&.to_i
    @end_time = parse_time(end_time) || Candle.max_ts(symbol: symbol, exchange: exchange)
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
    amount, tf = parse_timeframe
    interval = "#{amount} #{TIMEFRAMES[tf][:unit]}"
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
        open: BigDecimal(candle['open'].to_s).to_f,
        high: BigDecimal(candle['high'].to_s).to_f,
        low: BigDecimal(candle['low'].to_s).to_f,
        close: BigDecimal(candle['close'].to_s).to_f,
        volume: BigDecimal(candle['volume'].to_s).to_f
      }
    end
  end

  def calculate_start_time
    return Candle.min_ts(symbol: symbol, exchange: exchange) unless end_time

    count = limit || DEFAULT_LIMIT
    amount, tf = parse_timeframe
    end_time - (count * amount * TIMEFRAMES[tf][:duration])
  end

  def parse_timeframe
    match = timeframe.match(/(\d+)([mhdw])/)
    raise ArgumentError, "Invalid timeframe format: #{timeframe}" unless match

    [ match[1].to_i, match[2] ]
  end

  def parse_time(value)
    return nil if value.blank?
    value.is_a?(String) ? Time.zone.parse(value) : value.to_time.utc
  end
end
