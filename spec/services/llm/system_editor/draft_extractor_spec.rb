# frozen_string_literal: true

require 'rails_helper'

RSpec.describe Llm::SystemEditor::DraftExtractor do
  let!(:user) { create(:user, password: 'password123') }

  it 'uses the latest apply_system_draft tool result' do
    chat = user.ai_chats.create!(title: 'Alpha chat')

    previous_assistant = chat.ai_messages.create!(role: 'assistant', content: '')
    previous_tool_call = previous_assistant.ai_tool_calls.create!(
      tool_call_id: 'call_previous',
      name: 'apply_system_draft',
      arguments: { yaml: 'id: old' }
    )
    chat.ai_messages.create!(
      role: 'tool',
      parent_tool_call: previous_tool_call,
      content: JSON.generate(
        kind: 'system_draft',
        yaml: "id: old\nname: Old",
        source_yaml_hash: 'oldhash',
        validation: { ok: true, diagnostics: [], system: { id: 'old' } }
      )
    )

    latest_assistant = chat.ai_messages.create!(role: 'assistant', content: '')
    latest_tool_call = latest_assistant.ai_tool_calls.create!(
      tool_call_id: 'call_latest',
      name: 'apply_system_draft',
      arguments: { yaml: 'id: latest' }
    )
    chat.ai_messages.create!(
      role: 'tool',
      parent_tool_call: latest_tool_call,
      content: JSON.generate(
        kind: 'system_draft',
        yaml: "id: latest\nname: Latest",
        source_yaml_hash: 'latesthash',
        validation: { ok: false, diagnostics: [ { message: 'latest issue' } ], system: nil }
      )
    )

    draft = described_class.call(chat)

    expect(draft).to include(
      'kind' => 'system_draft',
      'yaml' => "id: latest\nname: Latest",
      'source_yaml_hash' => 'latesthash'
    )
    expect(draft.dig('validation', 'diagnostics')).to include(include('message' => 'latest issue'))
  end

  it 'keeps a suggested target when one is provided by the caller context' do
    chat = user.ai_chats.create!(title: 'Alpha chat')

    assistant = chat.ai_messages.create!(role: 'assistant', content: '')
    tool_call = assistant.ai_tool_calls.create!(
      tool_call_id: 'call_patch',
      name: 'apply_system_draft',
      arguments: { yaml: 'id: alpha' }
    )
    chat.ai_messages.create!(
      role: 'tool',
      parent_tool_call: tool_call,
      content: JSON.generate(
        kind: 'system_draft',
        yaml: "id: alpha\nname: Alpha",
        source_yaml_hash: 'hash123',
        validation: { ok: true, diagnostics: [], system: { id: 'alpha' } }
      )
    )

    draft = described_class.call(
      chat,
      suggested_target: {
        type: 'system_editor',
        system_id: 'alpha',
        source_path: 'systems/alpha.yml'
      }
    )

    expect(draft).to include(
      'suggested_target' => {
        'type' => 'system_editor',
        'system_id' => 'alpha',
        'source_path' => 'systems/alpha.yml'
      }
    )
  end

  it 'does not reuse an older draft when the current turn has no new draft' do
    chat = user.ai_chats.create!(title: 'Alpha chat')

    assistant = chat.ai_messages.create!(role: 'assistant', content: '')
    tool_call = assistant.ai_tool_calls.create!(
      tool_call_id: 'call_previous',
      name: 'apply_system_draft',
      arguments: { yaml: 'id: old' }
    )
    chat.ai_messages.create!(
      role: 'tool',
      parent_tool_call: tool_call,
      content: JSON.generate(
        kind: 'system_draft',
        yaml: "id: old\nname: Old",
        source_yaml_hash: 'oldhash',
        validation: { ok: true, diagnostics: [], system: { id: 'old' } }
      )
    )

    later_assistant = chat.ai_messages.create!(role: 'assistant', content: 'Explain how this system works')

    draft = described_class.call(chat, after_message_id: later_assistant.id - 1)

    expect(draft).to be_nil
  end
end
