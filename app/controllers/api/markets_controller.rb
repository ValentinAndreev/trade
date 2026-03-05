# frozen_string_literal: true

require 'net/http'
require 'json'

class Api::MarketsController < Api::ApplicationController
  YAML_PATH = Rails.root.join('config/markets.yml')

  def index
    symbols = load_symbols
    all_syms = symbols.values.flatten
    quotes = fetch_quotes(all_syms)

    data = symbols.transform_values do |syms|
      syms.filter_map { |sym| format_quote(sym, quotes[sym]) }
    end

    render json: data.merge(
      available: MarketsConfig.available,
      labels: MarketsConfig.labels,
    )
  end

  def add
    category = params.require(:category)
    symbol = params.require(:symbol)
    symbols = load_symbols

    list = symbols[category] ||= []
    list << symbol unless list.include?(symbol)
    save_symbols(symbols)

    render json: { symbols: symbols }
  end

  def remove
    category = params.require(:category)
    symbol = params.require(:symbol)
    symbols = load_symbols

    symbols[category]&.delete(symbol)
    save_symbols(symbols)

    render json: { symbols: symbols }
  end

  private

  def load_symbols
    return default_symbols unless YAML_PATH.exist?

    data = YAML.safe_load_file(YAML_PATH)
    data&.fetch('symbols', nil) || default_symbols
  end

  def save_symbols(symbols)
    YAML_PATH.write({ 'symbols' => symbols }.to_yaml)
  end

  def default_symbols
    cfg = MarketsConfig.symbols
    cfg.transform_keys(&:to_s).transform_values { |v| Array(v) }
  end

  def fetch_quotes(symbols)
    return {} if symbols.empty?

    cache_key = "yahoo_markets_#{Digest::MD5.hexdigest(symbols.sort.join(','))}"
    Rails.cache.fetch(cache_key, expires_in: MarketsConfig.cache_ttl.seconds) do
      fetch_yahoo_v8(symbols)
    end
  end

  def fetch_yahoo_v8(symbols)
    results = {}

    threads = symbols.map do |sym|
      Thread.new do
        uri = URI("#{MarketsConfig.api_url}/#{CGI.escape(sym)}?range=1d&interval=1d")
        http = Net::HTTP.new(uri.host, uri.port)
        http.use_ssl = true
        http.open_timeout = MarketsConfig.open_timeout
        http.read_timeout = MarketsConfig.read_timeout

        request = Net::HTTP::Get.new(uri)
        request['User-Agent'] = MarketsConfig.user_agent

        response = http.request(request)
        next unless response.is_a?(Net::HTTPSuccess)

        raw = JSON.parse(response.body)
        meta = raw.dig('chart', 'result', 0, 'meta')
        [ sym, meta ] if meta
      rescue StandardError => e
        Rails.logger.debug("[markets] fetch #{sym} failed: #{e.message}")
        nil
      end
    end

    threads.each do |t|
      result = t.value
      results[result[0]] = result[1] if result
    end

    results
  end

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
