# frozen_string_literal: true

class Utils::AlternativeMeClient
  include HTTParty

  class ApiError < StandardError; end

  base_uri 'https://api.alternative.me'
  default_timeout 15

  def fetch_history(limit: 0)
    response = self.class.get('/fng/', query: { limit:, format: 'json' })

    unless response.code == 200
      Rails.logger.warn("[alternative_me] fetch_history failed: HTTP #{response.code}")
      return []
    end

    (response.parsed_response['data'] || []).filter_map do |entry|
      ts = entry['timestamp']&.to_i
      value = entry['value']&.to_f
      next unless ts && value

      { ts: Time.at(ts).utc, value: }
    end
  rescue StandardError => e
    Rails.logger.warn("[alternative_me] fetch_history failed: #{e.message}")
    []
  end
end
