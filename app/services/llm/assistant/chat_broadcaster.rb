# frozen_string_literal: true

module Llm
  module Assistant
    class ChatBroadcaster
      class << self
        def stream_name(chat_id) = "assistant_chat:#{chat_id}"

        def broadcast(chat) = ActionCable.server.broadcast(stream_name(chat.id), Llm::Assistant::ChatPayloadBuilder.call(chat))
      end
    end
  end
end
