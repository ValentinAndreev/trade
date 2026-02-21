# frozen_string_literal: true

class Utils::BitfinexClient
  include HTTParty

  base_uri BitfinexConfig.api_url

  class ApiError < StandardError; end
  class RateLimitError < ApiError; end

  INTERVALS = %w[1m 5m 15m 30m 1h 3h 6h 12h 1D 1W 14D 1M].freeze
  MAX_LIMIT = 10_000

  def candles_history(symbol:, interval:, start_time: nil, end_time: nil, limit: MAX_LIMIT, sort: 1)
    params = { limit: limit, sort: sort }
    params[:start] = start_time if start_time
    params[:end] = end_time if end_time

    response = self.class.get(
      "/candles/trade:#{interval}:#{symbol}/hist",
      query: params
    )

    handle_response(response)
  end

  private

  def handle_response(response)
    case response.code
    when 200
      response.parsed_response
    when 429
      raise RateLimitError, 'Rate limit exceeded'
    else
      raise ApiError, "Bitfinex API error #{response.code}: #{response.message}"
    end
  end
end
