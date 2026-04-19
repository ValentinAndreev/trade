# frozen_string_literal: true

class Utils::YahooFinanceClient
  include HTTParty

  def fetch_quotes(symbols)
    return {} if symbols.empty?

    cache_key = "yahoo_markets_#{Digest::MD5.hexdigest(symbols.sort.join(','))}"
    Rails.cache.fetch(cache_key, expires_in: MarketsConfig.cache_ttl.seconds) do
      fetch_parallel(symbols)
    end
  end

  def fetch_history(ticker:, from: nil)
    query = { interval: '1d' }
    if from
      query[:period1] = from.to_i
      query[:period2] = Time.current.to_i
    else
      query[:range] = 'max'
    end

    response = get("#{MarketsConfig.api_url}/#{CGI.escape(ticker)}", query:)
    return [] unless response.success?

    result = response.parsed_response.dig('chart', 'result', 0)
    return [] unless result

    timestamps = result['timestamp'] || []
    closes = result.dig('indicators', 'quote', 0, 'close') || []

    timestamps.each_with_index.filter_map do |ts, i|
      next unless closes[i]
      { ts: Time.at(ts).utc, value: closes[i] }
    end
  rescue StandardError => e
    Rails.logger.warn("[yahoo] fetch_history #{ticker} failed: #{e.message}")
    []
  end

  private

  def fetch_parallel(symbols)
    results = {}
    threads = symbols.map { |sym| Thread.new { [ sym, fetch_one(sym) ] } }
    threads.each do |t|
      sym, meta = t.value
      results[sym] = meta if meta
    rescue StandardError => e
      Rails.logger.debug("[yahoo] thread error: #{e.message}")
    end
    results
  end

  def fetch_one(sym)
    response = get("#{MarketsConfig.api_url}/#{CGI.escape(sym)}", query: { range: '1m', interval: '1d' })
    return unless response.success?

    response.parsed_response.dig('chart', 'result', 0, 'meta')
  rescue StandardError => e
    Rails.logger.debug("[yahoo] fetch #{sym} failed: #{e.message}")
  end

  def get(url, query: {})
    self.class.get(url,
      query:,
      headers: { 'User-Agent' => MarketsConfig.user_agent },
      open_timeout: MarketsConfig.open_timeout,
      read_timeout: MarketsConfig.read_timeout)
  end
end
