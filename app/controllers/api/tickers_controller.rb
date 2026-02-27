# frozen_string_literal: true

class Api::TickersController < Api::ApplicationController
  def index
    render json: dashboard_symbols.filter_map { |s| build_ticker(s) }
  end

  private

  YAML_PATH = Rails.root.join('config/dashboard.yml')

  def dashboard_symbols
    if YAML_PATH.exist?
      data = YAML.safe_load_file(YAML_PATH)
      symbols = data&.fetch('symbols', nil)

      return symbols if symbols.present?
    end
    BitfinexConfig.symbols
  end

  def build_ticker(symbol)
    candles = Candle.for_symbol(symbol)
                    .ordered

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
      symbol: symbol,
      last_price: last_close,
      change_24h: change.round(8),
      change_24h_perc: change_perc.round(6),
      volume: recent.sum(:volume).to_f,
      high: recent.maximum(:high)&.to_f,
      low: recent.minimum(:low)&.to_f,
      sparkline: sample_sparkline(closes),
      updated_at: last_candle.ts.iso8601
    }
  end

  def sample_sparkline(closes)
    return closes if closes.size <= 48

    step = closes.size.to_f / 48
    (0...48).map { |i| closes[(i * step).round] }.compact
  end
end
