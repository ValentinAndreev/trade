# frozen_string_literal: true

class Candle::Fetcher
  MAX_LIMIT = 10_000
  RECENT_LIMIT = 5
  MAX_ATTEMPTS = 5
  SYMBOL_PREFIX = 't'
  EXCHANGE = 'bitfinex'
  HISTORY_START_MS = Time.utc(2016, 1, 1).to_i * 1000
  CONTINUOUS_AGGREGATE_BUCKETS = {
    'cagg_candles_5m' => 5.minutes,
    'cagg_candles_15m' => 15.minutes,
    'cagg_candles_1h' => 1.hour,
    'cagg_candles_4h' => 4.hours,
    'cagg_candles_1d' => 1.day
  }.freeze

  class FetchError < StandardError; end

  private attr_reader :client, :symbol, :interval, :load_all_data, :connection

  def initialize(symbol, interval: BitfinexConfig.default_interval, load_all_data: false)
    @client = Utils::BitfinexClient.new
    @symbol = symbol
    @interval = interval
    @load_all_data = load_all_data
    @connection = ActiveRecord::Base.connection
  end

  def call
    load_all_data ? paginate_history : sync_recent
  end

  private

  # --- Routine sync ---

  def sync_recent
    gap = gap_minutes
    if gap
      fetch_and_upsert([ gap + 2, RECENT_LIMIT ].max)
    else
      paginate_backward(from: current_time_ms)
    end
  end

  def gap_minutes
    latest_ts = Candle.max_ts(symbol: symbol, exchange: EXCHANGE)
    return nil unless latest_ts

    ((Time.zone.now - latest_ts) / 60).ceil
  end

  def fetch_and_upsert(limit)
    data = fetch_candles(end_time: current_time_ms, limit: [ limit, MAX_LIMIT ].min)
    return if data.blank?

    records = build_records(data)
    Candle.upsert_recent(records)
    broadcast_candles(records)
    invalidate_cache(:max)
  end

  # --- Historical backfill ---

  def paginate_history
    paginate_backward(from: history_start_ms, refresh_aggregates: true, invalidate_min: true)
  end

  def history_start_ms
    if @last_imported_ts
      ms = (@last_imported_ts.to_i - 60) * 1000
      return ms > HISTORY_START_MS ? ms : nil
    end

    candle_ts = Candle.min_ts(symbol: symbol, exchange: EXCHANGE)
    return current_time_ms unless candle_ts

    ms = (candle_ts.to_i - 60) * 1000
    ms > HISTORY_START_MS ? ms : nil
  end

  # --- Shared pagination ---

  def paginate_backward(from:, refresh_aggregates: false, invalidate_min: false)
    end_ms = from
    first_batch = true

    loop do
      break unless end_ms

      data = fetch_candles(end_time: end_ms)
      records = build_records(data)
      break if records.empty?

      imported_ts = import_and_broadcast(records, broadcast: first_batch)
      first_batch = false
      break if imported_ts.empty?

      refresh_continuous_aggregates(imported_ts) if refresh_aggregates
      invalidate_cache(:max)
      invalidate_cache(:min) if invalidate_min

      @last_imported_ts = imported_ts.min
      end_ms = next_page_ms(imported_ts.min)

      sleep(BitfinexConfig.rate_limit_pause)
    end
  end

  def import_and_broadcast(records, broadcast: false)
    imported_ts = Candle.import(records).rows.flatten
    return imported_ts unless broadcast && imported_ts.any?

    ts_set = imported_ts.to_set
    broadcast_candles(records.select { |r| ts_set.include?(r[:ts]) })
    imported_ts
  end

  def next_page_ms(oldest_ts)
    ms = (oldest_ts.to_i - 60) * 1000
    ms > HISTORY_START_MS ? ms : nil
  end

  # --- API ---

  def fetch_candles(end_time:, limit: MAX_LIMIT, attempt: 0)
    client.candles_history(
      symbol: SYMBOL_PREFIX + symbol,
      interval: interval,
      end_time: end_time,
      limit: limit
    )
  rescue Utils::BitfinexClient::RateLimitError, Utils::BitfinexClient::ApiError => e
    raise FetchError, "Request failed after #{MAX_ATTEMPTS} attempts: #{e.message}" if attempt >= MAX_ATTEMPTS

    Rails.logger.warn("Candle::Fetcher retry #{attempt + 1}/#{MAX_ATTEMPTS}: #{e.message}")
    sleep(retry_pause)
    fetch_candles(end_time: end_time, limit: limit, attempt: attempt + 1)
  end

  # --- Helpers ---

  def current_time_ms
    Time.zone.now.to_i * 1000
  end

  def build_records(data)
    return [] if data.blank?

    data.map do |(mts, open, close, high, low, volume)|
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
  end

  def broadcast_candles(records)
    return if records.blank?

    candles = records.sort_by { |r| r[:ts] }.map do |r|
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

  def invalidate_cache(kind)
    Rails.cache.delete("candle/#{kind}_ts/#{symbol}/#{EXCHANGE}")
  end

  def retry_pause
    Rails.env.test? ? 0.1 : 20
  end

  def refresh_continuous_aggregates(imported_timestamps)
    return if imported_timestamps.blank?

    min_ts = imported_timestamps.min
    max_ts = imported_timestamps.max

    CONTINUOUS_AGGREGATE_BUCKETS.each do |view_name, bucket_size|
      sql = Candle.sanitize_sql_array([
        'CALL refresh_continuous_aggregate(?, ?::timestamptz, ?::timestamptz)',
        view_name,
        (min_ts - bucket_size).utc,
        (max_ts + bucket_size).utc
      ])
      connection.execute(sql)
    end
  end
end
