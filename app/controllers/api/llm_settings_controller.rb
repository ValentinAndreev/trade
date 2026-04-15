# frozen_string_literal: true

class Api::LlmSettingsController < Api::ApplicationController
  before_action :require_auth
  rescue_from Llm::Error, with: :render_unprocessable_entity

  def show
    setting = selected_setting
    render json: response_payload(setting)
  end

  def create
    setting = build_setting_from_params

    if setting.save
      render json: response_payload(setting)
    else
      render json: { errors: setting.errors.full_messages }, status: :unprocessable_content
    end
  end

  def check
    setting = build_setting_from_params(persist: false)
    render json: {
      connection: Llm::EndpointCheck.call(
        provider: setting.provider,
        api_base: setting.api_base,
        api_key: setting.api_key
      )
    }
  end

  def launch
    setting = build_setting_from_params
    return render json: { errors: setting.errors.full_messages }, status: :unprocessable_content unless setting.save

    Llm::LlamaServerManager.new(setting).launch!
    render json: response_payload(setting.reload)
  end

  def stop
    provider = normalized_provider(params[:provider], fallback: nil)
    setting = current_user.llm_setting_for(provider)
    return render json: { error: 'LLM settings are not configured' }, status: :unprocessable_content unless setting

    Llm::LlamaServerManager.new(setting).stop!
    render json: response_payload(setting.reload)
  end

  private

  def setting_params = params.require(:llm_setting).permit(
    :provider,
    :model,
    :api_key,
    :api_base,
    :temperature,
    :max_output_tokens,
    launch_config: %i[binary_path model_path bind_host client_host port extra_args]
  )

  def selected_setting
    provider = normalized_provider(params[:provider] || current_user.active_llm_setting&.provider)
    current_user.llm_setting_for(provider) || current_user.llm_settings.build(
      provider:,
      model: Llm::ProviderCatalog.default_model(provider),
      api_base: Llm::ProviderCatalog.default_api_base(provider),
      temperature: default_temperature,
      max_output_tokens: default_max_output_tokens
    )
  end

  def normalized_provider(value, fallback: default_provider)
    provider = value.presence || fallback.presence || default_provider
    raise Llm::Error, "Unsupported LLM provider: #{provider}" unless Llm::ProviderCatalog.supported?(provider)

    provider
  end

  def response_payload(setting)
    {
      setting: setting.as_api_json,
      defaults: defaults_json,
      providers: Llm::ProviderCatalog.options,
      launch_status: launch_status_json(setting),
      model_suggestions: Llm::ProviderCatalog.suggestions(setting.provider),
      model_suggestions_by_provider: Llm::ProviderCatalog.suggestions_by_provider,
      settings_by_provider: settings_by_provider_json
    }
  end

  def default_provider = LlmConfig.default_provider

  def default_temperature = LlmConfig.default_temperature

  def default_max_output_tokens = LlmConfig.default_max_output_tokens

  def defaults_json
    {
      provider: default_provider,
      temperature: default_temperature,
      max_output_tokens: default_max_output_tokens
    }
  end

  def settings_by_provider_json
    current_user.llm_settings.each_with_object({}) do |setting, result|
      result[setting.provider] = setting.as_api_json
    end
  end

  def launch_status_json(setting)
    return nil unless Llm::ProviderCatalog.launchable?(setting.provider)

    Llm::LlamaServerManager.new(setting).status
  end

  def build_setting_from_params(persist: true)
    provider = normalized_provider(setting_params[:provider] || (persist ? nil : current_user.active_llm_setting&.provider))
    setting = if persist
      current_user.llm_settings.find_or_initialize_by(provider:)
    else
      current_user.llm_setting_for(provider)&.dup || current_user.llm_settings.build(provider:)
    end
    setting.assign_attributes(setting_attributes_for(provider))
    setting.api_key = setting_params[:api_key] if setting_params[:api_key].present?
    setting
  end

  def setting_attributes_for(provider)
    attrs = setting_params.except(:api_key).to_h
    attrs['provider'] = provider
    attrs
  end

  def render_unprocessable_entity(error)
    render json: { error: error.message }, status: :unprocessable_content
  end
end
