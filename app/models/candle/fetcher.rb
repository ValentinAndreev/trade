# frozen_string_literal: true

class Candle::Fetcher
  MAX_LIMIT = 10_000
  MAX_ATTEMPTS = 5
  SYMBOL_PREFIX = 't'
  EXCHANGE = 'bitfinex'
  CONTINUOUS_AGGREGATE_BUCKETS = {
    'cagg_candles_5m' => 5.minutes,
    'cagg_candles_15m' => 15.minutes,
    'cagg_candles_1h' => 1.hour,
    'cagg_candles_4h' => 4.hours,
    'cagg_candles_1d' => 1.day
  }.freeze

  class FetchError < StandardError; end

  private attr_reader :client, :symbol, :interval, :load_all_data, :connection

  # @param symbol [String] Trading pair without prefix (e.g., 'BTCUSD')
  # @param interval [String] Candle interval (default: '1m')
  # @param load_all_data [Boolean] When true, paginates forward from last stored candle
  def initialize(symbol, interval: BitfinexConfig.default_interval, load_all_data: false)
    @client = Utils::BitfinexClient.new
    @symbol = symbol
    @interval = interval
    @load_all_data = load_all_data
    @connection = ActiveRecord::Base.connection
  end

  def call
    loop do
      current_end_time = end_time_ms
      break unless current_end_time

      data = perform_request(current_end_time)
      saved_count, imported_timestamps = save_candles(data)
      break if saved_count.zero?
      refresh_continuous_aggregates(imported_timestamps) if load_all_data

      Rails.cache.delete("candle/max_ts/#{symbol}/#{EXCHANGE}")
      Rails.cache.delete("candle/min_ts/#{symbol}/#{EXCHANGE}") if load_all_data

      @last_imported_ts = imported_timestamps.min
      sleep(BitfinexConfig.rate_limit_pause)
    end
  end

  private

  HISTORY_START = Time.utc(2016, 1, 1).to_i * 1000

  def end_time_ms
    return @last_imported_ts ? (@last_imported_ts - 60).to_i * 1000 : without_last_minute_ms unless load_all_data

    candle_ts = Candle.min_ts(symbol: symbol, exchange: EXCHANGE)
    return without_last_minute_ms unless candle_ts

    end_ms = (candle_ts.to_i - 60) * 1000
    end_ms > HISTORY_START ? end_ms : nil
  end

  def perform_request(end_time, attempt: 0)
    client.candles_history(
      symbol: SYMBOL_PREFIX + symbol,
      interval: interval,
      end_time: end_time,
      limit: MAX_LIMIT
    )
  rescue Utils::BitfinexClient::RateLimitError, Utils::BitfinexClient::ApiError => e
    raise FetchError, "Request failed after #{MAX_ATTEMPTS} attempts: #{e.message}" if attempt >= MAX_ATTEMPTS

    Rails.logger.warn("Candle::Fetcher retry #{attempt + 1}/#{MAX_ATTEMPTS}: #{e.message}")
    sleep(retry_pause)
    perform_request(end_time, attempt: attempt + 1)
  end

  def save_candles(data)
    return [ 0, [] ] if data.blank?

    # Bitfinex format: [MTS, OPEN, CLOSE, HIGH, LOW, VOLUME]
    records = data.map do |(mts, open, close, high, low, volume)|
      {
        ts: Time.zone.at(mts / 1000),
        symbol: symbol,
        exchange: EXCHANGE,
        timeframe: interval,
        open: open,
        close: close,
        high: high,
        low: low,
        volume: volume
      }
    end

    imported_timestamps = Candle.import(records).rows.flatten
    broadcast_new_candles(records, imported_timestamps) if imported_timestamps.any?
    [ imported_timestamps.count, imported_timestamps ]
  end

  def without_last_minute_ms
    (Time.zone.now - 60).to_i * 1000
  end

  def broadcast_new_candles(records, imported_timestamps)
    new_records = records.select { |r| imported_timestamps.include?(r[:ts]) }
                         .sort_by { |r| r[:ts] }

    candles = new_records.map do |r|
      {
        time: r[:ts].to_i,
        open: r[:open].to_f,
        high: r[:high].to_f,
        low: r[:low].to_f,
        close: r[:close].to_f,
        volume: r[:volume].to_f
      }
    end

    ActionCable.server.broadcast("candles:#{symbol}:#{interval}", candles)
  end

  def retry_pause
    Rails.env.test? ? 0.1 : 20
  end

  def refresh_continuous_aggregates(imported_timestamps)
    return if imported_timestamps.blank?

    min_ts = imported_timestamps.min
    max_ts = imported_timestamps.max

    CONTINUOUS_AGGREGATE_BUCKETS.each do |view_name, bucket_size|
      from = connection.quote((min_ts - bucket_size).utc)
      to = connection.quote((max_ts + bucket_size).utc)

      connection.execute(<<~SQL.squish)
        CALL refresh_continuous_aggregate(
          '#{view_name}',
          #{from}::timestamptz,
          #{to}::timestamptz
        );
      SQL
    end
  end
end
