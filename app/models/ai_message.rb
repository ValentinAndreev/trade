# frozen_string_literal: true

class AiMessage < ApplicationRecord
  acts_as_message chat: :ai_chat, tool_calls: :ai_tool_calls, model: :ai_model, touch_chat: true

  validates :role, presence: true
  validates :ai_chat, presence: true

  after_commit :broadcast_chat_snapshot, on: %i[create update]

  def draft_metadata
    metadata.fetch('draft', {})
  end

  def draft_yaml
    draft_metadata['yaml']
  end

  def has_draft?
    draft_yaml.present?
  end

  def has_reasoning?
    thinking_text.present?
  end

  def display_content
    return content if content.present?
    return content_raw.to_json if content_raw.is_a?(Hash) || content_raw.is_a?(Array)

    nil
  end

  def displayable?
    role == 'user' || display_content.present? || has_draft? || has_reasoning?
  end

  private

  def broadcast_chat_snapshot
    return unless role == 'user' || (role == 'assistant' && displayable?)

    Llm::SystemEditor::ChatBroadcaster.broadcast(ai_chat)
  end
end
