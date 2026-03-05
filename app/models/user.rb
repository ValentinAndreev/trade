# frozen_string_literal: true

class User < ApplicationRecord
  has_secure_password

  has_many :presets, dependent: :destroy

  validates :username, presence: true, uniqueness: true, length: { minimum: 2, maximum: 50 }
  validates :password, length: { minimum: 4 }, allow_nil: true

  def default_preset
    presets.find_by(is_default: true)
  end

  def as_api_json(include_presets: true)
    data = { id: id, username: username }
    if include_presets
      data[:presets] = presets.order(:name).map do |p|
        { id: p.id, name: p.name, is_default: p.is_default }
      end
    end
    data
  end
end
