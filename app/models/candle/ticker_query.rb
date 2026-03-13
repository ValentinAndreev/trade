# frozen_string_literal: true

class Candle::TickerQuery
  SPARKLINE_POINTS = 48
  TICKERS_CACHE_KEY = 'bitfinex/live_tickers'
  TICKERS_CACHE_TTL = 15.seconds
  SPARKLINE_CACHE_TTL = 2.minutes

  # Bitfinex /v2/tickers response array indices
  IDX_SYMBOL          = 0
  IDX_DAILY_CHANGE    = 5
  IDX_DAILY_CHANGE_PC = 6
  IDX_LAST_PRICE      = 7
  IDX_VOLUME          = 8
  IDX_HIGH            = 9
  IDX_LOW             = 10

  def initialize(symbols) = @symbols = Array(symbols)

  def call
    live = fetch_live_tickers
    sparklines = fetch_all_sparklines
    @symbols.filter_map { |sym| build_ticker(sym, live[sym], sparklines[sym] || []) }
  end

  private

  def fetch_live_tickers
    raw = Rails.cache.fetch(TICKERS_CACHE_KEY, expires_in: TICKERS_CACHE_TTL) do
      prefixed = @symbols.map { |s| "t#{s}" }
      Utils::BitfinexClient.new.tickers(prefixed)
    end
    parse_tickers(raw)
  rescue Utils::BitfinexClient::ApiError, Net::OpenTimeout, Net::ReadTimeout, Errno::ECONNREFUSED => e
    Rails.logger.warn("Live tickers unavailable, falling back to DB: #{e.message}")
    {}
  end

  def parse_tickers(raw)
    Array(raw).each_with_object({}) do |row, result|
      sym = row[IDX_SYMBOL]&.sub(/\At/, '')
      next unless sym

      result[sym] = {
        last_price:      row[IDX_LAST_PRICE]&.to_f,
        change_24h:      row[IDX_DAILY_CHANGE]&.to_f,
        change_24h_perc: row[IDX_DAILY_CHANGE_PC]&.to_f,
        volume:          row[IDX_VOLUME]&.to_f,
        high:            row[IDX_HIGH]&.to_f,
        low:             row[IDX_LOW]&.to_f
      }
    end
  end

  def fetch_all_sparklines
    cache_key = "ticker_sparklines/#{@symbols.sort.join(',')}"

    Rails.cache.fetch(cache_key, expires_in: SPARKLINE_CACHE_TTL) do
      cutoff = 24.hours.ago
      rows = Candle.where(symbol: @symbols)
                   .where('ts >= ?', cutoff)
                   .order(ts: :asc)
                   .pluck(:symbol, :close)

      rows.group_by(&:first)
          .transform_values { |pairs| sample_sparkline(pairs.map { |_, c| c.to_f }) }
    end
  rescue ActiveRecord::StatementInvalid, ActiveRecord::ConnectionNotEstablished => e
    Rails.logger.warn("Sparkline fetch failed: #{e.message}")
    {}
  end

  def build_ticker(symbol, live, sparkline)
    if live
      {
        symbol:          symbol,
        last_price:      live[:last_price],
        change_24h:      live[:change_24h]&.round(8),
        change_24h_perc: live[:change_24h_perc]&.round(6),
        volume:          live[:volume],
        high:            live[:high],
        low:             live[:low],
        sparkline:       sparkline,
        updated_at:      Time.zone.now.iso8601
      }
    else
      build_ticker_from_db(symbol, sparkline)
    end
  end

  def build_ticker_from_db(symbol, sparkline)
    last_candle = Candle.for_symbol(symbol).ordered.last
    return nil unless last_candle

    cutoff = last_candle.ts - 24.hours
    recent = Candle.for_symbol(symbol).where('ts >= ?', cutoff)

    closes = recent.ordered.pluck(:close).map(&:to_f)
    first_close = closes.first || last_candle.close.to_f
    last_close  = last_candle.close.to_f
    change      = last_close - first_close
    change_perc = first_close.zero? ? 0.0 : change / first_close

    {
      symbol:          symbol,
      last_price:      last_close,
      change_24h:      change.round(8),
      change_24h_perc: change_perc.round(6),
      volume:          recent.sum(:volume).to_f,
      high:            recent.maximum(:high)&.to_f,
      low:             recent.minimum(:low)&.to_f,
      sparkline:       sparkline,
      updated_at:      last_candle.ts.iso8601
    }
  end

  def sample_sparkline(closes)
    return closes if closes.size <= SPARKLINE_POINTS

    step = closes.size.to_f / SPARKLINE_POINTS
    (0...SPARKLINE_POINTS).map { |i| closes[(i * step).round] }.compact
  end
end
