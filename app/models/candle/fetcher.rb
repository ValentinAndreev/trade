# frozen_string_literal: true

class Candle::Fetcher
  MAX_LIMIT = 10_000
  MAX_ATTEMPTS = 5
  SYMBOL_PREFIX = 't'
  EXCHANGE = 'bitfinex'

  class FetchError < StandardError; end

  private attr_reader :client, :symbol, :interval, :load_all_data

  # @param symbol [String] Trading pair without prefix (e.g., 'BTCUSD')
  # @param interval [String] Candle interval (default: '1m')
  # @param load_all_data [Boolean] When true, paginates forward from last stored candle
  def initialize(symbol, interval: BitfinexConfig.default_interval, load_all_data: false)
    @client = Utils::BitfinexClient.new
    @symbol = symbol
    @interval = interval
    @load_all_data = load_all_data
  end

  def call
    loop do
      current_end_time = end_time_ms
      break unless current_end_time

      data = perform_request(current_end_time)
      saved_count = save_candles(data)
      break if saved_count.zero?

      Rails.cache.delete("candle/max_ts/#{symbol}/#{EXCHANGE}")
      sleep(BitfinexConfig.rate_limit_pause)
    end
  end

  private

  def end_time_ms
    return without_last_minute_ms unless load_all_data

    candle_ts = Candle.max_ts(symbol: symbol, exchange: EXCHANGE)
    return without_last_minute_ms unless candle_ts

    calculated = (candle_ts.to_i * 1000) + (MAX_LIMIT * 60 * 1000)
    [ calculated, without_last_minute_ms ].min
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
    return 0 if data.blank?

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

    count = Candle.import(records).rows.flatten.count
    broadcast_last_candle(records) if count.positive?
    count
  end

  def without_last_minute_ms
    (Time.zone.now - 60).to_i * 1000
  end

  def broadcast_last_candle(records)
    last = records.max_by { |r| r[:ts] }
    ActionCable.server.broadcast("candles:#{symbol}:#{interval}", {
      time: last[:ts].to_i,
      open: last[:open].to_f,
      high: last[:high].to_f,
      low: last[:low].to_f,
      close: last[:close].to_f,
      volume: last[:volume].to_f
    })
  end

  def retry_pause
    Rails.env.test? ? 0.1 : 20
  end
end
