# frozen_string_literal: true

module Llm
  module SystemEditor
    class ChatBroadcaster
      class << self
        def stream_name(chat_id)
          "system_editor_chat:#{chat_id}"
        end

        def broadcast(chat)
          ActionCable.server.broadcast(stream_name(chat.id), ChatPayloadBuilder.call(chat))
        end
      end
    end
  end
end
