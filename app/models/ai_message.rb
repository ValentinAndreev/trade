# frozen_string_literal: true

class AiMessage < ApplicationRecord
  acts_as_message chat: :ai_chat, tool_calls: :ai_tool_calls, model: :ai_model, touch_chat: true

  validates :role, presence: true
  validates :ai_chat, presence: true

  after_commit :broadcast_chat_snapshot, on: %i[create update destroy]

  def draft_metadata = metadata.fetch('draft', {})
  def draft_yaml = draft_metadata['yaml']
  def has_draft? = draft_yaml.present?
  def has_reasoning? = thinking_text.present?
  def display_content = content.presence || content_raw&.to_json
  def displayable? = role == 'user' || display_content.present? || has_draft? || has_reasoning?

  private

  def broadcast_chat_snapshot
    return unless role == 'user' || (role == 'assistant' && displayable?)

    Llm::Assistant::ChatBroadcaster.broadcast(ai_chat)
  end
end
