# frozen_string_literal: true

class Api::MarketsController < Api::ApplicationController
  def index
    symbols = MarketsConfig.symbols
    all_syms = symbols.values.flatten
    quotes = Utils::YahooFinanceClient.new.fetch_quotes(all_syms)

    data = symbols.transform_values do |syms|
      syms.filter_map { |sym| format_quote(sym, quotes[sym]) }
    end

    render json: data.merge(
      available: MarketsConfig.available,
      labels: MarketsConfig.labels,
    )
  end

  VALID_CATEGORIES = %w[indices forex commodities].freeze

  def add
    category = params.require(:category)
    symbol = params.require(:symbol)

    unless VALID_CATEGORIES.include?(category)
      return render json: { error: "Invalid category: #{category}" }, status: :bad_request
    end

    available = MarketsConfig.available[category] || []
    unless available.include?(symbol)
      return render json: { error: "Unknown symbol: #{symbol}" }, status: :bad_request
    end

    render json: { symbols: Utils::SymbolStore.add_market_symbol(category, symbol) }
  end

  def remove
    category = params.require(:category)
    symbol = params.require(:symbol)
    render json: { symbols: Utils::SymbolStore.remove_market_symbol(category, symbol) }
  end

  private

  def format_quote(sym, meta)
    return nil unless meta

    prev = meta['chartPreviousClose'] || meta['previousClose']
    price = meta['regularMarketPrice']
    change = prev && price ? price - prev : nil
    change_pct = prev && prev != 0 && change ? (change / prev) * 100 : nil

    market_time = meta['regularMarketTime']
    updated_at = market_time ? Time.at(market_time).utc.iso8601 : nil

    {
      symbol:     sym,
      name:       MarketsConfig.labels[sym] || meta['shortName'] || meta['longName'] || sym,
      price:      price,
      change:     change&.round(4),
      change_pct: change_pct&.round(2),
      high:       meta['regularMarketDayHigh'],
      low:        meta['regularMarketDayLow'],
      prev_close: prev,
      currency:   meta['currency'],
      updated_at: updated_at
    }
  end
end
