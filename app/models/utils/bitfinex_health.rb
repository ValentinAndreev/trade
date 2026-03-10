# frozen_string_literal: true

require 'net/http'
require 'uri'

class Utils::BitfinexHealth
  CACHE_KEY = 'utils/bitfinex_health/reachable'
  CACHE_TTL = 90.seconds
  TIMEOUT = 4

  class << self
    # Returns cached reachability. Falls back to a fresh check if cache is empty.
    def reachable?
      val = Rails.cache.read(CACHE_KEY)
      val.nil? ? check! : val
    end

    # Always does a fresh network check, caches and returns the result.
    def check!
      result = ping
      Rails.cache.write(CACHE_KEY, result, expires_in: CACHE_TTL)
      result
    end

    def invalidate!
      Rails.cache.delete(CACHE_KEY)
    end

    private

    def ping
      uri = URI.parse("#{BitfinexConfig.api_url}/status/api")
      Net::HTTP.start(uri.host, uri.port,
        use_ssl: uri.scheme == 'https',
        open_timeout: TIMEOUT,
        read_timeout: TIMEOUT
      ) do |http|
        response = http.get(uri.request_uri)
        response.is_a?(Net::HTTPSuccess)
      end
    rescue => e
      Rails.logger.warn("BitfinexHealth check failed: #{e.class}: #{e.message}")
      false
    end
  end
end
