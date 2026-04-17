# frozen_string_literal: true

module Llm
  class EndpointCheck
    OPEN_TIMEOUT = 2
    READ_TIMEOUT = 5

    class << self
      def call(provider:, api_base:, api_key: nil)
        checked_url = models_url(api_base)
        return { ok: false, checked_url: nil, models: [], error: 'Base URL is not configured' } if checked_url.blank?

        uri = URI.parse(checked_url)
        request = Net::HTTP::Get.new(uri)
        request['Authorization'] = "Bearer #{api_key}" if api_key.present? && Llm::ProviderCatalog.api_key_required?(provider, api_base)

        response = Net::HTTP.start(uri.host, uri.port, use_ssl: uri.scheme == 'https', open_timeout: OPEN_TIMEOUT, read_timeout: READ_TIMEOUT) do |http|
          http.request(request)
        end

        body = response.body.to_s
        if response.is_a?(Net::HTTPSuccess)
          { ok: true, checked_url:, models: parse_models(body), error: nil }
        else
          { ok: false, checked_url:, models: [], error: extract_error(body, response.message) }
        end
      rescue StandardError => e
        { ok: false, checked_url:, models: [], error: e.message }
      end

      private

      def models_url(api_base)
        return if api_base.blank?

        uri = URI.parse(api_base.to_s)
        base_path = uri.path.to_s.sub(%r{/+\z}, '')
        base_path = '/v1' if base_path.blank? || base_path == '/'
        uri.path = "#{base_path}/models"
        uri.query = nil
        uri.fragment = nil
        uri.to_s
      rescue URI::InvalidURIError
        nil
      end

      def parse_models(body)
        JSON.parse(body).fetch('data', []).filter_map { |entry| entry['id'].to_s.presence }
      rescue JSON::ParserError, TypeError, NoMethodError
        []
      end

      def extract_error(body, fallback)
        error = JSON.parse(body)['error']
        error.fetch('message', nil).presence || fallback
      rescue JSON::ParserError, NoMethodError
        error.to_s.presence || fallback
      rescue StandardError
        fallback
      end
    end
  end
end
