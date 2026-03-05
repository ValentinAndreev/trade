# frozen_string_literal: true

class Preset < ApplicationRecord
  belongs_to :user

  validates :name, presence: true, uniqueness: { scope: :user_id }
  validates :payload, presence: true

  before_save :ensure_single_default

  private

  def ensure_single_default
    return unless is_default? && is_default_changed?

    user.presets.where.not(id: id).update_all(is_default: false)
  end
end
