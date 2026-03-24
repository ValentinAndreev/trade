# frozen_string_literal: true

require 'rails_helper'

RSpec.describe 'Api::LlmSettings' do
  let!(:user) { create(:user, password: 'password123') }

  describe 'GET /api/llm_settings' do
    it 'requires authentication' do
      get '/api/llm_settings'

      expect(response).to have_http_status(:unauthorized)
    end

    it 'returns defaults for a signed-in user without saved settings' do
      sign_in(user)

      get '/api/llm_settings'

      expect(response).to have_http_status(:ok)
      expect(response.parsed_body['setting']).to include(
        'provider' => 'gemini',
        'api_key_present' => false
      )
      expect(response.parsed_body['setting']['model']).to be_present
      expect(response.parsed_body['providers']).to include(include('value' => 'gemini'))
      expect(response.parsed_body['model_suggestions_by_provider']).to include('gemini')
    end

    it 'returns the requested provider as the selected setting' do
      sign_in(user)
      user.llm_settings.create!(
        provider: 'openrouter',
        model: 'openrouter/free',
        api_key: 'openrouter-key',
        temperature: 0.2,
        max_output_tokens: 4000
      )

      get '/api/llm_settings', params: { provider: 'gemini' }

      expect(response).to have_http_status(:ok)
      expect(response.parsed_body['setting']).to include(
        'provider' => 'gemini',
        'api_key_present' => false
      )
      expect(response.parsed_body['setting']['model']).to be_present
    end
  end

  describe 'POST /api/llm_settings' do
    before { sign_in(user) }

    it 'creates and returns per-user settings' do
      post '/api/llm_settings', params: {
        llm_setting: {
          provider: 'anthropic',
          model: 'claude-sonnet-4-5',
          api_key: 'secret-key',
          api_base: 'https://example.test',
          temperature: 0.3,
          max_output_tokens: 6000
        }
      }

      expect(response).to have_http_status(:ok)

      setting = user.reload.active_llm_setting
      expect(setting).to have_attributes(
        provider: 'anthropic',
        model: 'claude-sonnet-4-5',
        api_base: 'https://example.test',
        max_output_tokens: 6000
      )
      expect(setting.temperature.to_f).to eq(0.3)
      expect(setting.api_key).to eq('secret-key')
      expect(response.parsed_body['setting']['api_key_present']).to eq(true)
    end

    it 'keeps saved keys separately for each provider' do
      post '/api/llm_settings', params: {
        llm_setting: {
          provider: 'gemini',
          model: 'gemini-3-flash-preview',
          api_key: 'gemini-key',
          temperature: 0.2,
          max_output_tokens: 4000
        }
      }
      post '/api/llm_settings', params: {
        llm_setting: {
          provider: 'deepseek',
          model: 'deepseek-chat',
          api_key: 'deepseek-key',
          temperature: 0.2,
          max_output_tokens: 4000
        }
      }

      user.reload
      expect(user.llm_setting_for('gemini')&.api_key).to eq('gemini-key')
      expect(user.llm_setting_for('deepseek')&.api_key).to eq('deepseek-key')
      expect(user.active_llm_setting&.provider).to eq('deepseek')
      expect(response.parsed_body.dig('settings_by_provider', 'gemini', 'api_key_present')).to eq(true)
      expect(response.parsed_body.dig('settings_by_provider', 'deepseek', 'api_key_present')).to eq(true)
    end
  end
end
