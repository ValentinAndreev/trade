# frozen_string_literal: true

class AiChat < ApplicationRecord
  DEFAULT_TITLE = 'New chat'

  acts_as_chat messages: :ai_messages, model: :ai_model

  belongs_to :user

  has_one :last_preview_message,
    -> { where(role: %w[user assistant]).where.not(content: [ nil, '' ]).order(created_at: :desc, id: :desc) },
    class_name: 'AiMessage'

  validates :title, presence: true, length: { maximum: 120 }

  scope :recent, -> { order(updated_at: :desc, id: :desc) }

  before_validation :ensure_title

  def visible_messages = ai_messages.where(role: %w[user assistant]).order(:created_at, :id)

  def latest_preview = last_preview_message&.content

  private

  def ensure_title = self.title = title.to_s.strip.presence || default_title

  def default_title = DEFAULT_TITLE
end
