# frozen_string_literal: true

class AiModel < ApplicationRecord
  acts_as_model chats: :ai_chats
end
