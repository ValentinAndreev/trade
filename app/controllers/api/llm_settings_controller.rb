# frozen_string_literal: true

class Api::LlmSettingsController < Api::ApplicationController
  before_action :require_auth

  def show
    setting = selected_setting
    render json: {
      setting: setting.as_api_json,
      providers: Llm::ProviderCatalog.options,
      model_suggestions: Llm::ProviderCatalog.suggestions(setting.provider),
      model_suggestions_by_provider: Llm::ProviderCatalog.suggestions_by_provider,
      settings_by_provider: settings_by_provider_json
    }
  end

  def create
    provider = setting_params[:provider].presence || 'gemini'
    setting = current_user.llm_settings.find_or_initialize_by(provider:)
    setting.assign_attributes(setting_params.except(:api_key))
    setting.api_key = setting_params[:api_key] if setting_params[:api_key].present?

    if setting.save
      render json: {
        setting: setting.as_api_json,
        providers: Llm::ProviderCatalog.options,
        model_suggestions: Llm::ProviderCatalog.suggestions(setting.provider),
        model_suggestions_by_provider: Llm::ProviderCatalog.suggestions_by_provider,
        settings_by_provider: settings_by_provider_json
      }
    else
      render json: { errors: setting.errors.full_messages }, status: :unprocessable_content
    end
  end

  def check
    draft = setting_params.to_h.symbolize_keys
    provider = draft[:provider].presence || 'gemini'
    setting = current_user.llm_setting_for(provider)

    result = Llm::ConnectionCheck.call(
      provider:,
      api_base: draft[:api_base].presence || setting&.api_base,
      api_key: draft[:api_key].presence || setting&.api_key
    )

    render json: {
      ok: result.ok?,
      message: result.message,
      normalized_api_base: result.normalized_api_base,
      checked_url: result.checked_url,
      models: result.models
    }, status: (result.ok? ? :ok : :unprocessable_entity)
  end

  private

  def setting_params = params.require(:llm_setting).permit(:provider, :model, :api_key, :api_base, :temperature, :max_output_tokens)

  def selected_setting
    provider = params[:provider].presence || current_user.active_llm_setting&.provider || 'gemini'
    current_user.llm_setting_for(provider) || current_user.llm_settings.build(
      provider:,
      model: Llm::ProviderCatalog.suggestions(provider).first || default_model_for(provider),
      temperature: 0.2,
      max_output_tokens: 4000
    )
  end

  def default_model_for(provider)
    provider.to_s == 'ollama' ? '' : 'gemini-3-flash-preview'
  end

  def settings_by_provider_json
    current_user.llm_settings.each_with_object({}) do |setting, result|
      result[setting.provider] = setting.as_api_json
    end
  end
end
