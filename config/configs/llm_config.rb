class LlmConfig < ApplicationConfig
  attr_config \
    default_provider: 'gemini',
    default_temperature: 0.2,
    default_max_output_tokens: 4000,
    llama_default_binary_path: '~/llama.cpp/build/bin/llama-server',
    llama_default_bind_host: '0.0.0.0',
    llama_default_client_host: '127.0.0.1',
    llama_default_port: 8080,
    llama_allowed_binary_names: %w[llama-server]

  FALLBACK_PROVIDER = 'gemini'

  def default_provider
    provider = super.presence&.to_s
    return FALLBACK_PROVIDER if provider.blank?

    Llm::ProviderCatalog.supported?(provider) ? provider : FALLBACK_PROVIDER
  end

  def default_temperature = super.to_f

  def default_max_output_tokens = super.to_i

  def llama_default_binary_path = super.to_s.presence || '~/llama.cpp/build/bin/llama-server'

  def llama_default_bind_host = super.to_s.presence || '0.0.0.0'

  def llama_default_client_host = super.to_s.presence || '127.0.0.1'

  def llama_default_port
    port = super.to_i
    port.positive? ? port : 8080
  end

  def llama_allowed_binary_names
    Array(super)
      .flat_map { |value| value.to_s.split(',') }
      .map(&:strip)
      .filter(&:present?)
      .presence || %w[llama-server]
  end
end
