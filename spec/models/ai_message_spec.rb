# frozen_string_literal: true

require 'rails_helper'

RSpec.describe AiMessage, type: :model do
  let!(:user) { create(:user, password: 'password123') }
  let!(:chat) { user.ai_chats.create!(title: 'Alpha chat') }

  it 'broadcasts when an assistant message becomes visible through reasoning' do
    message = chat.ai_messages.create!(role: 'assistant', content: '')
    allow(Llm::Assistant::ChatBroadcaster).to receive(:broadcast)

    message.update!(thinking_text: 'Comparing EMA and RSI')

    expect(Llm::Assistant::ChatBroadcaster).to have_received(:broadcast).with(chat)
  end

  it 'does not broadcast tool-only messages' do
    allow(Llm::Assistant::ChatBroadcaster).to receive(:broadcast)

    chat.ai_messages.create!(role: 'tool', content: '{"ok":true}')

    expect(Llm::Assistant::ChatBroadcaster).not_to have_received(:broadcast)
  end
end
