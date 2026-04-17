# frozen_string_literal: true

require 'rails_helper'

RSpec.describe 'Api::AssistantChats' do
  let!(:user) { create(:user, password: 'password123') }

  before { sign_in(user) }

  describe 'GET /api/assistant_chats' do
    it 'returns recent chats for the current user' do
      alpha = user.ai_chats.create!(title: 'Alpha')
      beta = user.ai_chats.create!(title: 'Beta')
      create(:user, password: 'password123').ai_chats.create!(title: 'Other')

      get '/api/assistant_chats'

      expect(response).to have_http_status(:ok)
      expect(response.parsed_body['chats'].map { |chat| chat['id'] }).to match_array([ alpha.id, beta.id ])
    end
  end

  describe 'POST /api/assistant_chats' do
    it 'creates a chat for the current user' do
      expect {
        post '/api/assistant_chats', params: { title: 'My chat' }
      }.to change { user.ai_chats.count }.by(1)

      expect(response).to have_http_status(:created)
      expect(response.parsed_body['chat']).to include('title' => 'My chat')
      expect(response.parsed_body['chat']).not_to have_key('source_path')
      expect(response.parsed_body['chat']).not_to have_key('system_id')
      expect(response.parsed_body['messages']).to eq([])
    end
  end

  describe 'GET /api/assistant_chats/:id' do
    it 'returns only visible messages and keeps draft inside assistant message metadata' do
      chat = user.ai_chats.create!(title: 'Alpha chat')
      chat.ai_messages.create!(role: 'user', content: 'Fix the exits')
      chat.ai_messages.create!(role: 'tool', content: '{"ok":true}')
      chat.ai_messages.create!(role: 'assistant', content: 'Draft ready', metadata: {
        'draft' => {
          'kind' => 'system_draft',
          'yaml' => "id: alpha\nname: Alpha",
          'source_yaml_hash' => 'abc123',
          'validation' => { 'ok' => true, 'diagnostics' => [], 'system' => { 'id' => 'alpha' } },
          'suggested_target' => { 'type' => 'system_editor', 'system_id' => 'alpha', 'source_path' => 'systems/alpha.yml' },
          'origin_chat_id' => chat.id
        }
      })

      get "/api/assistant_chats/#{chat.id}"

      expect(response).to have_http_status(:ok)
      expect(response.parsed_body['messages'].map { |message| message['role'] }).to eq(%w[user assistant])
      expect(response.parsed_body).not_to have_key('draft')
      expect(response.parsed_body['messages'].last['metadata']['draft']).to include(
        'kind' => 'system_draft',
        'yaml' => "id: alpha\nname: Alpha",
        'source_yaml_hash' => 'abc123',
        'suggested_target' => include('source_path' => 'systems/alpha.yml')
      )
    end

    it 'returns assistant reasoning even when visible content is empty' do
      chat = user.ai_chats.create!(title: 'Alpha chat')
      chat.ai_messages.create!(role: 'assistant', content: '', thinking_text: 'Comparing EMA and RSI conditions')

      get "/api/assistant_chats/#{chat.id}"

      expect(response).to have_http_status(:ok)
      expect(response.parsed_body['messages']).to contain_exactly(
        include(
          'role' => 'assistant',
          'content' => nil,
          'thinking_text' => 'Comparing EMA and RSI conditions'
        )
      )
    end
  end

  describe 'POST /api/assistant_chats/:id/messages' do
    it 'returns a full chat payload from the LLM runner' do
      chat = user.ai_chats.create!(title: 'Alpha chat')
      user.llm_settings.create!(
        provider: 'gemini',
        model: 'gemini-3-flash-preview',
        api_key: 'secret-key',
        temperature: 0.2,
        max_output_tokens: 4000
      )

      draft = {
        'kind' => 'system_draft',
        'yaml' => "id: alpha_updated\nname: Alpha Updated",
        'source_yaml_hash' => 'abc123',
        'validation' => { 'ok' => true, 'diagnostics' => [], 'system' => { 'id' => 'alpha_updated' } },
        'suggested_target' => { 'type' => 'system_editor', 'system_id' => 'alpha_updated', 'source_path' => 'systems/alpha.yml' },
        'origin_chat_id' => chat.id
      }

      runner = instance_double(Llm::Assistant::ChatRunner)
      allow(Llm::Assistant::ChatRunner).to receive(:new).and_return(runner)
      allow(runner).to receive(:call) do
        chat.ai_messages.create!(role: 'user', content: 'Fix the system')
        assistant_message = chat.ai_messages.create!(role: 'assistant', content: 'Updated draft', metadata: { 'draft' => draft })
        Llm::Assistant::ChatRunner::Result.new(chat: chat.reload, assistant_message:)
      end

      post "/api/assistant_chats/#{chat.id}/messages", params: {
        content: 'Fix the system',
        assistant_context: {
          host_type: 'assistant_tab',
          linked_target: {
            type: 'system_editor',
            tab_id: 'tab-5',
            system_id: 'alpha',
            source_path: 'systems/alpha.yml'
          },
          referenced_tab_ids: [],
          workspace_snapshot: { active_tab_id: 'tab-1', tabs: [] },
          editor_context: {
            system_yaml: "id: alpha\nname: Alpha",
            system_id: 'alpha',
            source_path: 'systems/alpha.yml',
            yaml_hash: 'abc123',
            diagnostics: []
          }
        }
      }

      expect(response).to have_http_status(:ok)
      expect(response.parsed_body['messages'].map { |message| message['role'] }).to eq(%w[user assistant])
      expect(response.parsed_body).not_to have_key('draft')
      expect(response.parsed_body['messages'].last['metadata']['draft']['yaml']).to eq("id: alpha_updated\nname: Alpha Updated")
    end

    it 'rejects message sending when settings are missing' do
      chat = user.ai_chats.create!(title: 'Alpha chat')

      post "/api/assistant_chats/#{chat.id}/messages", params: { content: 'Fix the system' }

      expect(response).to have_http_status(:unprocessable_content)
      expect(response.parsed_body['error']).to include('LLM settings')
    end

    it 'allows sending with a local endpoint that does not require an API key' do
      chat = user.ai_chats.create!(title: 'Alpha chat')
      user.llm_settings.create!(
        provider: 'openai',
        model: 'qwen3.5_9B',
        api_base: 'http://127.0.0.1:8080/v1',
        temperature: 0.2,
        max_output_tokens: 4000
      )

      runner = instance_double(Llm::Assistant::ChatRunner)
      allow(Llm::Assistant::ChatRunner).to receive(:new).and_return(runner)
      allow(runner).to receive(:call) do
        chat.ai_messages.create!(role: 'user', content: 'What model are you?')
        assistant_message = chat.ai_messages.create!(role: 'assistant', content: 'qwen3.5_9B')
        Llm::Assistant::ChatRunner::Result.new(chat: chat.reload, assistant_message:)
      end

      post "/api/assistant_chats/#{chat.id}/messages", params: {
        provider: 'openai',
        content: 'What model are you?'
      }

      expect(response).to have_http_status(:ok)
      expect(response.parsed_body['messages'].map { |message| message['role'] }).to eq(%w[user assistant])
    end

    it 'accepts assistant_context from the workspace assistant tab' do
      chat = user.ai_chats.create!(title: 'Alpha chat')
      user.llm_settings.create!(
        provider: 'gemini',
        model: 'gemini-3-flash-preview',
        api_key: 'secret-key',
        temperature: 0.2,
        max_output_tokens: 4000
      )

      runner = instance_double(Llm::Assistant::ChatRunner)
      allow(Llm::Assistant::ChatRunner).to receive(:new).and_return(runner)
      allow(runner).to receive(:call) do
        chat.ai_messages.create!(role: 'user', content: 'Draft a trend system')
        assistant_message = chat.ai_messages.create!(role: 'assistant', content: 'Draft ready')
        Llm::Assistant::ChatRunner::Result.new(chat: chat.reload, assistant_message:)
      end

      post "/api/assistant_chats/#{chat.id}/messages", params: {
        provider: 'gemini',
        content: 'Draft a trend system',
        assistant_context: {
          host_type: 'assistant_tab',
          linked_target: nil,
          referenced_tab_ids: [],
          workspace_snapshot: {
            active_tab_id: 'tab-7',
            tabs: [
              { id: 'tab-7', type: 'assistant', label: 'Assistant', source_path: nil, system_id: nil }
            ]
          },
          editor_context: {
            system_yaml: '',
            system_id: nil,
            source_path: nil,
            yaml_hash: nil,
            diagnostics: []
          }
        }
      }

      expect(response).to have_http_status(:ok)
      expect(runner).to have_received(:call).with(
        content: 'Draft a trend system',
        assistant_context: include('host_type' => 'assistant_tab')
      )
    end
  end
end
