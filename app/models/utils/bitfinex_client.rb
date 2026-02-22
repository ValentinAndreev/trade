# frozen_string_literal: true

class Utils::BitfinexClient
  include HTTParty

  base_uri BitfinexConfig.api_url

  class ApiError < StandardError; end
  class RateLimitError < ApiError; end

  INTERVALS = %w[1m].freeze
  MAX_LIMIT = 10_000

  def candles_history(symbol:, interval:, start_time: nil, end_time: nil, limit: MAX_LIMIT)
    params = { limit: limit }
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
