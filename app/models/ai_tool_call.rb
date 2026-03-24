# frozen_string_literal: true

class AiToolCall < ApplicationRecord
  acts_as_tool_call message: :ai_message, result: :result

  validates :tool_call_id, presence: true, uniqueness: true
  validates :name, presence: true
end
