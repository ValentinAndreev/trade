# frozen_string_literal: true

module Llm
  module SystemEditor
    class ChatPayloadBuilder
      class << self
        def call(chat)
          chat = AiChat.find(chat) unless chat.is_a?(AiChat)

          {
            chat: chat_json(chat),
            messages: messages_json(chat)
          }
        end

        private

        def chat_json(chat)
          {
            id: chat.id,
            title: chat.title,
            source_path: chat.source_path,
            system_id: chat.system_id,
            updated_at: chat.updated_at.iso8601,
            last_message_preview: chat.latest_preview.to_s.truncate(120),
            last_used_provider: chat.last_used_provider,
            last_used_model: chat.last_used_model
          }
        end

        def messages_json(chat)
          chat.visible_messages.filter_map do |message|
            next unless message.displayable?

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
