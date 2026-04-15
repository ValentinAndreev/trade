# frozen_string_literal: true

require 'rails_helper'

RSpec.describe 'Api::SystemEditorChats' do
  Result = Struct.new(:chat, :assistant_message, keyword_init: true)

  let!(:user) { create(:user, password: 'password123') }

  before { sign_in(user) }

  describe 'GET /api/system_editor_chats' do
    it 'filters chats by current user and source_path' do
      keep = user.ai_chats.create!(title: 'Alpha', source_path: 'systems/alpha.yml', system_id: 'alpha')
      user.ai_chats.create!(title: 'Beta', source_path: 'systems/beta.yml', system_id: 'beta')
      create(:user, password: 'password123').ai_chats.create!(title: 'Other', source_path: 'systems/alpha.yml', system_id: 'alpha')

      get '/api/system_editor_chats', params: { source_path: 'systems/alpha.yml' }

      expect(response).to have_http_status(:ok)
      expect(response.parsed_body['chats'].map { |chat| chat['id'] }).to eq([ keep.id ])
    end
  end

  describe 'POST /api/system_editor_chats' do
    it 'creates a chat for the current user' do
      expect {
        post '/api/system_editor_chats', params: { source_path: 'systems/alpha.yml', system_id: 'alpha' }
      }.to change { user.ai_chats.count }.by(1)

      expect(response).to have_http_status(:created)
      expect(response.parsed_body['chat']).to include(
        'source_path' => 'systems/alpha.yml',
        'system_id' => 'alpha'
      )
      expect(response.parsed_body['messages']).to eq([])
    end
  end

  describe 'GET /api/system_editor_chats/:id' do
    it 'returns only visible messages and keeps draft inside assistant message metadata' do
      chat = user.ai_chats.create!(title: 'Alpha chat', source_path: 'systems/alpha.yml', system_id: 'alpha')
      chat.ai_messages.create!(role: 'user', content: 'Fix the exits')
      chat.ai_messages.create!(role: 'tool', content: '{"ok":true}')
      chat.ai_messages.create!(role: 'assistant', content: 'Draft ready', metadata: {
        'draft' => {
          'yaml' => "id: alpha\nname: Alpha",
          'source_yaml_hash' => 'abc123',
          'validation' => { 'ok' => true, 'diagnostics' => [], 'system' => { 'id' => 'alpha' } }
        }
      })

      get "/api/system_editor_chats/#{chat.id}"

      expect(response).to have_http_status(:ok)
      expect(response.parsed_body['messages'].map { |message| message['role'] }).to eq(%w[user assistant])
      expect(response.parsed_body).not_to have_key('draft')
      expect(response.parsed_body['messages'].last['metadata']['draft']).to include(
        'yaml' => "id: alpha\nname: Alpha",
        'source_yaml_hash' => 'abc123'
      )
    end

    it 'returns assistant reasoning even when visible content is empty' do
      chat = user.ai_chats.create!(title: 'Alpha chat', source_path: 'systems/alpha.yml', system_id: 'alpha')
      chat.ai_messages.create!(role: 'assistant', content: '', thinking_text: 'Comparing EMA and RSI conditions')

      get "/api/system_editor_chats/#{chat.id}"

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

  describe 'POST /api/system_editor_chats/:id/messages' do
    it 'returns a full chat payload from the LLM runner' do
      chat = user.ai_chats.create!(title: 'Alpha chat', source_path: 'systems/alpha.yml', system_id: 'alpha')
      user.llm_settings.create!(
        provider: 'gemini',
        model: 'gemini-3-flash-preview',
        api_key: 'secret-key',
        temperature: 0.2,
        max_output_tokens: 4000
      )

      draft = {
        'yaml' => "id: alpha_updated\nname: Alpha Updated",
        'source_yaml_hash' => 'abc123',
        'validation' => { 'ok' => true, 'diagnostics' => [], 'system' => { 'id' => 'alpha_updated' } }
      }

      runner = instance_double(Llm::SystemEditor::ChatRunner)
      allow(Llm::SystemEditor::ChatRunner).to receive(:new).and_return(runner)
      allow(runner).to receive(:call) do
        chat.ai_messages.create!(role: 'user', content: 'Fix the system')
        assistant_message = chat.ai_messages.create!(role: 'assistant', content: 'Updated draft', metadata: { 'draft' => draft })
        Result.new(chat: chat.reload, assistant_message:)
      end

      post "/api/system_editor_chats/#{chat.id}/messages", params: {
        content: 'Fix the system',
        editor_context: {
          system_yaml: "id: alpha\nname: Alpha",
          system_id: 'alpha',
          source_path: 'systems/alpha.yml',
          yaml_hash: 'abc123',
          diagnostics: []
        }
      }

      expect(response).to have_http_status(:ok)
      expect(response.parsed_body['messages'].map { |message| message['role'] }).to eq(%w[user assistant])
      expect(response.parsed_body).not_to have_key('draft')
      expect(response.parsed_body['messages'].last['metadata']['draft']['yaml']).to eq("id: alpha_updated\nname: Alpha Updated")
    end

    it 'rejects message sending when settings are missing' do
      chat = user.ai_chats.create!(title: 'Alpha chat', source_path: 'systems/alpha.yml', system_id: 'alpha')

      post "/api/system_editor_chats/#{chat.id}/messages", params: {
        content: 'Fix the system',
        editor_context: {
          system_yaml: "id: alpha\nname: Alpha",
          system_id: 'alpha',
          source_path: 'systems/alpha.yml',
          yaml_hash: 'abc123',
          diagnostics: []
        }
      }

      expect(response).to have_http_status(:unprocessable_content)
      expect(response.parsed_body['error']).to include('LLM settings')
    end

    it 'allows sending with a local endpoint that does not require an API key' do
      chat = user.ai_chats.create!(title: 'Alpha chat', source_path: 'systems/alpha.yml', system_id: 'alpha')
      user.llm_settings.create!(
        provider: 'openai',
        model: 'qwen3.5_9B',
        api_base: 'http://127.0.0.1:8080/v1',
        temperature: 0.2,
        max_output_tokens: 4000
      )

      runner = instance_double(Llm::SystemEditor::ChatRunner)
      allow(Llm::SystemEditor::ChatRunner).to receive(:new).and_return(runner)
      allow(runner).to receive(:call) do
        chat.ai_messages.create!(role: 'user', content: 'What model are you?')
        assistant_message = chat.ai_messages.create!(role: 'assistant', content: 'qwen3.5_9B')
        Result.new(chat: chat.reload, assistant_message:)
      end

      post "/api/system_editor_chats/#{chat.id}/messages", params: {
        provider: 'openai',
        content: 'What model are you?',
        editor_context: {
          system_yaml: "id: alpha\nname: Alpha",
          system_id: 'alpha',
          source_path: 'systems/alpha.yml',
          yaml_hash: 'abc123',
          diagnostics: []
        }
      }

      expect(response).to have_http_status(:ok)
      expect(response.parsed_body['messages'].map { |message| message['role'] }).to eq(%w[user assistant])
    end
  end
end
