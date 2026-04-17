# frozen_string_literal: true

module Llm
  module Assistant
    class ChatPayloadBuilder
      class << self
        def call(chat)
          raise ArgumentError, "Expected AiChat, got #{chat.class}" unless chat.is_a?(AiChat)

          {
            chat: chat_summary(chat),
            messages: messages_json(chat)
          }
        end

        def chat_summary(chat)
          {
            id: chat.id,
            title: chat.title,
            updated_at: chat.updated_at.iso8601,
            last_message_preview: chat.latest_preview.to_s.truncate(120),
            last_used_provider: chat.last_used_provider,
            last_used_model: chat.last_used_model
          }
        end

        private

        def messages_json(chat)
          chat.visible_messages
            .where("content IS NOT NULL OR content_raw IS NOT NULL OR thinking_text IS NOT NULL OR metadata ? 'draft'")
            .map do |message|
            {
              id: message.id,
              role: message.role,
              content: message.display_content,
              created_at: message.created_at.iso8601,
              thinking_text: message.thinking_text,
              metadata: message.metadata
            }
          end
        end
      end
    end
  end
end
