# frozen_string_literal: true

class Utils::FredClient
  include HTTParty

  class ApiError < StandardError; end

  # NOTE: FRED requires api_key as a query param (no header auth support).
  # Do not enable HTTParty debug logging for this client — the key would appear in logged URLs.
  # base_uri is intentionally omitted: the api_key in query params would be logged by HTTParty
  # if base_uri + logger were configured together. Manual URL construction keeps the pattern explicit.
  # WARNING: api_key appears in the full request URL and will be written to server access logs
  # (nginx/apache). Ensure log scrubbing or access log suppression is configured for this endpoint.
  BASE_URI = 'https://api.stlouisfed.org/fred'

  default_timeout 15

  def fetch_series(series_id:, from: nil)
    api_key = MacroConfig.fred_api_key
    if api_key.blank?
      Rails.logger.warn('[fred] fred_api_key not configured, skipping')
      return []
    end

    params = {
      series_id:,
      api_key:,
      file_type: 'json',
      sort_order: 'asc',
      observation_start: from&.strftime('%Y-%m-%d')
    }.compact

    response = self.class.get("#{BASE_URI}/series/observations", query: params)

    unless response.code == 200
      Rails.logger.warn("[fred] fetch #{series_id} failed: FRED API error #{response.code}")
      return []
    end

    observations = response.parsed_response['observations'] || []
    observations.filter_map do |obs|
      next if obs['value'] == '.'
      { ts: Time.parse("#{obs['date']}T00:00:00Z").utc, value: obs['value'].to_f }
    end
  rescue StandardError => e
    Rails.logger.warn("[fred] fetch #{series_id} failed: #{e.message}")
    []
  end
end
