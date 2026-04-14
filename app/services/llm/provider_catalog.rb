# frozen_string_literal: true

module Llm
  class ProviderCatalog
    PROVIDERS = [
      { value: 'openai', label: 'OpenAI' },
      { value: 'anthropic', label: 'Anthropic' },
      { value: 'gemini', label: 'Google Gemini' },
      { value: 'ollama', label: 'Ollama' },
      { value: 'openrouter', label: 'OpenRouter' },
      { value: 'mistral', label: 'Mistral' },
      { value: 'xai', label: 'xAI' },
      { value: 'perplexity', label: 'Perplexity' },
      { value: 'deepseek', label: 'DeepSeek' }
    ].freeze

    class << self
      def options = PROVIDERS

      def suggestions_by_provider(limit: 30)
        PROVIDERS.to_h do |provider|
          [ provider[:value], suggestions(provider[:value], limit:) ]
        end
      end

      def suggestions(provider, limit: 30)
        provider_slug = provider.to_s
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
