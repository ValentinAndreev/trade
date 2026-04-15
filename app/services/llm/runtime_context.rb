# frozen_string_literal: true

module Llm
  class RuntimeContext
    API_KEY_OPTIONS = {
      'openai' => :openai_api_key,
      'anthropic' => :anthropic_api_key,
      'gemini' => :gemini_api_key,
      'openrouter' => :openrouter_api_key,
      'mistral' => :mistral_api_key,
      'xai' => :xai_api_key,
      'perplexity' => :perplexity_api_key,
      'deepseek' => :deepseek_api_key
    }.freeze

    API_BASE_OPTIONS = {
      'openai' => :openai_api_base,
      'anthropic' => :anthropic_api_base,
      'gemini' => :gemini_api_base,
      'openrouter' => :openrouter_api_base,
      'deepseek' => :deepseek_api_base,
      'ollama' => :ollama_api_base,
      'llama' => :ollama_api_base
    }.freeze

    class << self
      def build(setting)
        runtime_provider = Llm::ProviderCatalog.runtime_provider(setting.provider)

        RubyLLM.context do |config|
          config.default_model = setting.model

          api_key_option = API_KEY_OPTIONS[runtime_provider]
          config.public_send("#{api_key_option}=", setting.api_key) if api_key_option && setting.api_key.present?

          api_base_option = API_BASE_OPTIONS[runtime_provider]
          config.public_send("#{api_base_option}=", setting.api_base) if api_base_option && setting.api_base.present?
        end
      end
    end
  end
end
