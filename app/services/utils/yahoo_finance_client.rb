# frozen_string_literal: true

require 'net/http'

class Utils::YahooFinanceClient
  def fetch_quotes(symbols)
    return {} if symbols.empty?

    cache_key = "yahoo_markets_#{Digest::MD5.hexdigest(symbols.sort.join(','))}"
    Rails.cache.fetch(cache_key, expires_in: MarketsConfig.cache_ttl.seconds) do
      fetch_parallel(symbols)
    end
  end

  private

  def fetch_parallel(symbols)
    results = {}

    threads = symbols.map do |sym|
      Thread.new { [ sym, fetch_one(sym) ] }
    end

    threads.each do |t|
      sym, meta = t.value
      results[sym] = meta if meta
    rescue StandardError => e
      Rails.logger.debug("[yahoo] thread error: #{e.message}")
    end

    results
  end

  def fetch_one(sym)
    uri = URI("#{MarketsConfig.api_url}/#{CGI.escape(sym)}?range=1m&interval=1d")

    http = Net::HTTP.new(uri.host, uri.port)
    http.use_ssl = true
    http.open_timeout = MarketsConfig.open_timeout
    http.read_timeout = MarketsConfig.read_timeout

    request = Net::HTTP::Get.new(uri)
    request['User-Agent'] = MarketsConfig.user_agent

    response = http.request(request)
    return nil unless response.is_a?(Net::HTTPSuccess)

    raw = JSON.parse(response.body)
    raw.dig('chart', 'result', 0, 'meta')
  rescue StandardError => e
    Rails.logger.debug("[yahoo] fetch #{sym} failed: #{e.message}")
    nil
  end
end
