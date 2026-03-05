# frozen_string_literal: true

class Candle::TickerQuery
  SPARKLINE_POINTS = 48

  def initialize(symbols)
    @symbols = Array(symbols)
  end

  def call
    @symbols.filter_map { |sym| build_ticker(sym) }
  end

  private

  def build_ticker(symbol)
    candles = Candle.for_symbol(symbol).ordered
    last_candle = candles.last
    return nil unless last_candle

    cutoff = last_candle.ts - 24.hours
    recent = candles.where('ts >= ?', cutoff)

    closes = recent.pluck(:close).map(&:to_f)
    first_close = closes.first || last_candle.close.to_f
    last_close = last_candle.close.to_f
    change = last_close - first_close
    change_perc = first_close.zero? ? 0.0 : change / first_close

    {
      symbol:       symbol,
      last_price:   last_close,
      change_24h:   change.round(8),
      change_24h_perc: change_perc.round(6),
      volume:       recent.sum(:volume).to_f,
      high:         recent.maximum(:high)&.to_f,
      low:          recent.minimum(:low)&.to_f,
      sparkline:    sample_sparkline(closes),
      updated_at:   last_candle.ts.iso8601
    }
  end

  def sample_sparkline(closes)
    return closes if closes.size <= SPARKLINE_POINTS

    step = closes.size.to_f / SPARKLINE_POINTS
    (0...SPARKLINE_POINTS).map { |i| closes[(i * step).round] }.compact
  end
end
