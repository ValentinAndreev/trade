# frozen_string_literal: true

module Llm
  class ProviderCatalog
    PROVIDERS = [
      { value: 'openai', label: 'OpenAI', api_key_required: true, default_model: 'gpt-4.1-mini', default_api_base: nil, launchable: false, runtime_provider: 'openai' },
      { value: 'anthropic', label: 'Anthropic', api_key_required: true, default_model: 'claude-sonnet-4-5', default_api_base: nil, launchable: false, runtime_provider: 'anthropic' },
      { value: 'gemini', label: 'Google Gemini', api_key_required: true, default_model: 'gemini-3-flash-preview', default_api_base: nil, launchable: false, runtime_provider: 'gemini' },
      { value: 'openrouter', label: 'OpenRouter', api_key_required: true, default_model: 'openai/gpt-4.1-mini', default_api_base: nil, launchable: false, runtime_provider: 'openrouter' },
      { value: 'mistral', label: 'Mistral', api_key_required: true, default_model: 'mistral-medium-latest', default_api_base: nil, launchable: false, runtime_provider: 'mistral' },
      { value: 'xai', label: 'xAI', api_key_required: true, default_model: 'grok-3-mini', default_api_base: nil, launchable: false, runtime_provider: 'xai' },
      { value: 'perplexity', label: 'Perplexity', api_key_required: true, default_model: 'sonar', default_api_base: nil, launchable: false, runtime_provider: 'perplexity' },
      { value: 'deepseek', label: 'DeepSeek', api_key_required: true, default_model: 'deepseek-chat', default_api_base: nil, launchable: false, runtime_provider: 'deepseek' },
      { value: 'ollama', label: 'Ollama', api_key_required: false, default_model: '', default_api_base: 'http://127.0.0.1:11434/v1', launchable: false, runtime_provider: 'ollama' },
      { value: 'llama', label: 'llama.cpp', api_key_required: false, default_model: '', default_api_base: nil, launchable: true, runtime_provider: 'openai', suggestions_provider: nil }
    ].freeze

    class << self
      def options = PROVIDERS

      def values = PROVIDERS.map { |provider| provider[:value] }

      def provider_for(value)
        PROVIDERS.find { |provider| provider[:value] == value.to_s }
      end

      def supported?(value) = provider_for(value).present?

      def runtime_provider(provider)
        provider_for(provider)&.fetch(:runtime_provider, provider.to_s).to_s
      end

      def launchable?(provider)
        provider_for(provider)&.fetch(:launchable, false) == true
      end

      def default_model(provider)
        suggestions(provider).first || provider_for(provider)&.fetch(:default_model, '').to_s
      end

      def default_api_base(provider)
        return Llm::LlamaServerManager.build_api_base({}) if provider.to_s == 'llama'

        provider_for(provider)&.fetch(:default_api_base, nil)
      end

      def api_key_required?(provider, _api_base = nil)
        return false if local_endpoint?(provider, _api_base)

        provider_for(provider)&.fetch(:api_key_required, true) != false
      end

      def setting_configured?(setting)
        return false unless setting&.model.present?
        return true unless api_key_required?(setting.provider, setting.api_base)

        setting.api_key.present?
      end

      def local_endpoint?(provider, api_base = nil)
        return true if %w[ollama llama].include?(provider.to_s)
        return false if api_base.blank?

        host = URI.parse(api_base.to_s).host
        return false if host.blank?

        %w[localhost 127.0.0.1 0.0.0.0 ::1].include?(host)
      rescue URI::InvalidURIError
        false
      end

      def tool_calling_enabled?(provider:, model:, api_base: nil)
        return false if local_endpoint?(provider, api_base)

        provider_slug = provider_for(provider)&.fetch(:suggestions_provider, runtime_provider(provider))
        return false if provider_slug.blank?

        model_id = model.to_s
        RubyLLM.models.all.any? { |m| m.provider == provider_slug && m.supports_functions? && m.id == model_id }
      rescue StandardError
        false
      end

      def suggestions_by_provider(limit: 30)
        PROVIDERS.to_h do |provider|
          [ provider[:value], suggestions(provider[:value], limit:) ]
        end
      end

      def suggestions(provider, limit: 30)
        provider_slug = provider_for(provider)&.fetch(:suggestions_provider, runtime_provider(provider))
        return [] if provider_slug.blank?

        RubyLLM.models.all
               .select { |model| model.provider == provider_slug && model.supports_functions? }
               .first(limit)
               .map { |model| model.id }
      rescue StandardError
        []
      end
    end
  end
end
