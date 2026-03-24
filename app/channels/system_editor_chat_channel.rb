# frozen_string_literal: true

class SystemEditorChatChannel < ApplicationCable::Channel
  def subscribed
    chat = current_user.ai_chats.find_by(id: params[:chat_id])
    return reject unless chat

    stream_from Llm::SystemEditor::ChatBroadcaster.stream_name(chat.id)
  end
end
