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
        'api_key_present' => false,
        'api_key_required' => true
      )
      expect(response.parsed_body['defaults']).to include(
        'provider' => 'gemini',
        'temperature' => 0.2,
        'max_output_tokens' => 4000
      )
      expect(response.parsed_body['setting']['model']).to be_present
      expect(response.parsed_body['providers']).to include(
        include('value' => 'gemini', 'api_key_required' => true),
        include('value' => 'ollama', 'api_key_required' => false),
        include('value' => 'llama', 'api_key_required' => false, 'launchable' => true)
      )
      expect(response.parsed_body['model_suggestions_by_provider']).to include('gemini')
      expect(response.parsed_body['model_suggestions_by_provider']['llama']).to eq([])
    end

    it 'uses config-backed defaults for the selected setting' do
      sign_in(user)
      allow(LlmConfig).to receive(:default_provider).and_return('openai')
      allow(LlmConfig).to receive(:default_temperature).and_return(0.4)
      allow(LlmConfig).to receive(:default_max_output_tokens).and_return(8192)

      get '/api/llm_settings'

      expect(response).to have_http_status(:ok)
      expect(response.parsed_body['setting']).to include(
        'provider' => 'openai',
        'temperature' => 0.4,
        'max_output_tokens' => 8192
      )
      expect(response.parsed_body['defaults']).to include(
        'provider' => 'openai',
        'temperature' => 0.4,
        'max_output_tokens' => 8192
      )
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
      expect(response.parsed_body['setting']['api_key_required']).to eq(true)
    end

    it 'rejects unsupported providers instead of silently falling back' do
      post '/api/llm_settings', params: {
        llm_setting: {
          provider: 'not-a-provider',
          model: 'whatever',
          temperature: 0.3,
          max_output_tokens: 6000
        }
      }

      expect(response).to have_http_status(:unprocessable_content)
      expect(response.parsed_body['error']).to eq('Unsupported LLM provider: not-a-provider')
      expect(user.reload.llm_settings).to be_empty
    end

    it 'uses the configured default provider when the provider is omitted' do
      allow(LlmConfig).to receive(:default_provider).and_return('openai')

      post '/api/llm_settings', params: {
        llm_setting: {
          model: 'gpt-4.1-mini',
          api_key: 'secret-key',
          temperature: 0.3,
          max_output_tokens: 6000
        }
      }

      expect(response).to have_http_status(:ok)
      expect(user.reload.active_llm_setting).to have_attributes(
        provider: 'openai',
        model: 'gpt-4.1-mini'
      )
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

    it 'accepts ollama without an API key' do
      post '/api/llm_settings', params: {
        llm_setting: {
          provider: 'ollama',
          model: 'qwen3.5:9b',
          api_base: 'http://127.0.0.1:11434/v1',
          temperature: 0.2,
          max_output_tokens: 4000
        }
      }

      expect(response).to have_http_status(:ok)

      setting = user.reload.llm_setting_for('ollama')
      expect(setting).to have_attributes(
        provider: 'ollama',
        model: 'qwen3.5:9b',
        api_base: 'http://127.0.0.1:11434/v1'
      )
      expect(setting.api_key).to be_blank
      expect(response.parsed_body['setting']).to include(
        'api_key_present' => false,
        'api_key_required' => false
      )
    end

    it 'accepts local OpenAI-compatible endpoints without an API key' do
      post '/api/llm_settings', params: {
        llm_setting: {
          provider: 'openai',
          model: 'qwen3.5_9B',
          api_base: 'http://127.0.0.1:8080/v1',
          temperature: 0.2,
          max_output_tokens: 4000
        }
      }

      expect(response).to have_http_status(:ok)
      expect(response.parsed_body['setting']).to include(
        'provider' => 'openai',
        'api_key_present' => false,
        'api_key_required' => false
      )
    end

    it 'saves llama launch config and derives api_base from client host and port' do
      post '/api/llm_settings', params: {
        llm_setting: {
          provider: 'llama',
          model: 'Qwen3.5-9B-Q6_K',
          temperature: 0.2,
          max_output_tokens: 4000,
          launch_config: {
            binary_path: '~/llama.cpp/build/bin/llama-server',
            model_path: '~/models/Qwen3.5-9B-Q6_K.gguf',
            bind_host: '0.0.0.0',
            client_host: '127.0.0.1',
            port: 8080,
            extra_args: '-ngl 99 -c 16384 -t 8 -b 512 --flash-attn auto'
          }
        }
      }

      expect(response).to have_http_status(:ok)

      setting = user.reload.llm_setting_for('llama')
      expect(setting).to have_attributes(
        provider: 'llama',
        model: 'Qwen3.5-9B-Q6_K',
        api_base: 'http://127.0.0.1:8080/v1'
      )
      expect(setting.launch_config).to include(
        'binary_path' => '~/llama.cpp/build/bin/llama-server',
        'model_path' => '~/models/Qwen3.5-9B-Q6_K.gguf',
        'bind_host' => '0.0.0.0',
        'client_host' => '127.0.0.1',
        'port' => 8080
      )
    end
  end

  describe 'POST /api/llm_settings/launch' do
    before { sign_in(user) }

    it 'launches llama.cpp through the manager and returns launch status' do
      manager = instance_double(Llm::LlamaServerManager, launch!: {
        supported: true,
        configured: true,
        running: true,
        reachable: false,
        pid: 12345,
        api_base: 'http://127.0.0.1:8080/v1',
        log_path: '/tmp/llama.log',
        started_at: '2026-04-15T12:00:00Z',
        message: 'llama.cpp server started'
      }, status: {
        supported: true,
        configured: true,
        running: true,
        reachable: false,
        pid: 12345,
        api_base: 'http://127.0.0.1:8080/v1',
        log_path: '/tmp/llama.log',
        started_at: '2026-04-15T12:00:00Z',
        message: 'llama.cpp server started'
      })
      allow(Llm::LlamaServerManager).to receive(:new).and_return(manager)

      post '/api/llm_settings/launch', params: {
        llm_setting: {
          provider: 'llama',
          model: 'Qwen3.5-9B-Q6_K',
          temperature: 0.2,
          max_output_tokens: 4000,
          launch_config: {
            binary_path: '~/llama.cpp/build/bin/llama-server',
            model_path: '~/models/Qwen3.5-9B-Q6_K.gguf',
            bind_host: '0.0.0.0',
            client_host: '127.0.0.1',
            port: 8080,
            extra_args: '-ngl 99'
          }
        }
      }

      expect(response).to have_http_status(:ok)
      expect(Llm::LlamaServerManager).to have_received(:new).at_least(:once)
      expect(response.parsed_body['launch_status']).to include(
        'running' => true,
        'pid' => 12345,
        'message' => 'llama.cpp server started'
      )
    end
  end
end
