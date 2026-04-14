# frozen_string_literal: true

require 'json'
require 'net/http'
require 'uri'

module Llm
  class ConnectionCheck
    TIMEOUT = 4
    DEFAULT_API_BASES = {
      'ollama' => 'http://127.0.0.1:11434/v1'
    }.freeze

    Result = Struct.new(:ok?, :message, :normalized_api_base, :checked_url, :models, keyword_init: true)

    class << self
      def call(provider:, api_base:, api_key: nil)
        new(provider:, api_base:, api_key:).call
      end
    end

    def initialize(provider:, api_base:, api_key:)
      @provider = provider.to_s
      @api_base = api_base.to_s.strip
      @api_key = api_key.to_s.strip
    end

    def call
      normalized_base = normalize_api_base
      return failure('Base URL is required for this provider.') if normalized_base.blank?

      uri = URI.parse(normalized_base)
      if uri.host == '0.0.0.0'
        return failure('0.0.0.0 is a bind address, not a client address. Use 127.0.0.1 on the same machine or your LAN IP from another host.', normalized_api_base: normalized_base)
      end

      models_uri = URI.parse("#{normalized_base}/models")
      request = Net::HTTP::Get.new(models_uri)
      request['Authorization'] = "Bearer #{@api_key}" if @api_key.present?

      response = Net::HTTP.start(
        models_uri.host,
        models_uri.port,
        use_ssl: models_uri.scheme == 'https',
        open_timeout: TIMEOUT,
        read_timeout: TIMEOUT
      ) { |http| http.request(request) }

      return success(models_uri.to_s, normalized_base, response) if response.is_a?(Net::HTTPSuccess)

      failure(build_http_error(response, normalized_base), normalized_api_base: normalized_base, checked_url: models_uri.to_s)
    rescue URI::InvalidURIError
      failure('Base URL is invalid. Expected something like http://127.0.0.1:11434/v1 or http://127.0.0.1:8080/v1.')
    rescue StandardError => e
      failure("#{e.class}: #{e.message}", normalized_api_base: normalized_base)
    end

    private

    def normalize_api_base
      raw = @api_base.presence || DEFAULT_API_BASES[@provider]
      return nil if raw.blank?

      uri = URI.parse(raw)
      return nil if uri.scheme.blank? || uri.host.blank?

      uri.path = normalized_path(uri)
      uri.query = nil if uri.query.blank?
      uri.fragment = nil
      uri.to_s.sub(%r{/*$}, '')
    end

    def normalized_path(uri)
      path = uri.path.to_s.strip
      return '/v1' if path.blank? || path == '/'
      path
    end

    def success(checked_url, normalized_base, response)
      parsed = JSON.parse(response.body)
      models = Array(parsed['data']).filter_map do |entry|
        next unless entry.is_a?(Hash)
        entry['id'].to_s.presence
      end.first(20)

      message = if models.any?
        "Connected to #{checked_url}. Models: #{models.join(', ')}"
      else
        "Connected to #{checked_url}."
      end

      Result.new(
        ok?: true,
        message:,
        normalized_api_base: normalized_base,
        checked_url:,
        models:
      )
    rescue JSON::ParserError
      Result.new(
        ok?: true,
        message: "Connected to #{checked_url}, but the response was not valid JSON.",
        normalized_api_base: normalized_base,
        checked_url:,
        models: []
      )
    end

    def build_http_error(response, normalized_base)
      base = "Connection check failed with HTTP #{response.code}"
      if response.code.to_i == 404 && URI.parse(normalized_base).path == '/v1'
        "#{base}. Check that the server exposes an OpenAI-compatible /v1 API."
      elsif response.code.to_i == 404
        "#{base}. Try a Base URL ending with /v1."
      else
        "#{base}. #{response.body.to_s.truncate(160)}"
      end
    end

    def failure(message, normalized_api_base: nil, checked_url: nil)
      Result.new(
        ok?: false,
        message:,
        normalized_api_base: normalized_api_base,
        checked_url: checked_url,
        models: []
      )
    end
  end
end
