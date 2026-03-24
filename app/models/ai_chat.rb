# frozen_string_literal: true

class AiChat < ApplicationRecord
  acts_as_chat messages: :ai_messages, model: :ai_model

  belongs_to :user

  validates :title, presence: true, length: { maximum: 120 }

  scope :recent, -> { order(updated_at: :desc, id: :desc) }

  before_validation :ensure_title

  def visible_messages
    ai_messages.where(role: %w[user assistant]).order(:created_at, :id)
  end

  def latest_preview
    visible_messages.where.not(content: [ nil, '' ]).order(:created_at, :id).last&.content
  end

  private

  def ensure_title
    self.title = title.to_s.strip.presence || default_title
  end

  def default_title
    base = system_id.presence || source_path.to_s.split('/').last.to_s.delete_suffix('.yml')
    return 'New chat' if base.blank?

    base.tr('_-', ' ').split.map(&:capitalize).join(' ')
  end
end
