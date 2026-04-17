# frozen_string_literal: true

class AssistantChatChannel < ApplicationCable::Channel
  def subscribed
    chat = current_user.ai_chats.find_by(id: params[:chat_id])
    return reject unless chat

    stream_from Llm::Assistant::ChatBroadcaster.stream_name(chat.id)
  end
end
