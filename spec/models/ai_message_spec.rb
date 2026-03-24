# frozen_string_literal: true

require 'rails_helper'

RSpec.describe AiMessage, type: :model do
  let!(:user) { create(:user, password: 'password123') }
  let!(:chat) { user.ai_chats.create!(title: 'Alpha chat', source_path: 'systems/alpha.yml', system_id: 'alpha') }

  it 'broadcasts when an assistant message becomes visible through reasoning' do
    message = chat.ai_messages.create!(role: 'assistant', content: '')
    allow(Llm::SystemEditor::ChatBroadcaster).to receive(:broadcast)

    message.update!(thinking_text: 'Comparing EMA and RSI')

    expect(Llm::SystemEditor::ChatBroadcaster).to have_received(:broadcast).with(chat)
  end

  it 'does not broadcast tool-only messages' do
    allow(Llm::SystemEditor::ChatBroadcaster).to receive(:broadcast)

    chat.ai_messages.create!(role: 'tool', content: '{"ok":true}')

    expect(Llm::SystemEditor::ChatBroadcaster).not_to have_received(:broadcast)
  end
end
