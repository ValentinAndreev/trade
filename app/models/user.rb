# frozen_string_literal: true

class User < ApplicationRecord
  has_secure_password

  has_many :presets, dependent: :destroy
  has_many :ai_chats, dependent: :destroy
  has_many :llm_settings, dependent: :destroy
  belongs_to :default_preset, class_name: 'Preset', optional: true

  validates :username, presence: true, uniqueness: true, length: { minimum: 2, maximum: 50 }
  validates :password, length: { minimum: 4 }, allow_nil: true

  def active_llm_setting = llm_settings.order(updated_at: :desc, id: :desc).first
  def llm_setting_for(provider) = llm_settings.find_by(provider: provider.to_s)

  def as_api_json(include_presets: true)
    data = { id: id, username: username }
    if include_presets
      data[:presets] = presets.order(:name).map do |p|
        { id: p.id, name: p.name, is_default: p.id == default_preset_id }
      end
    end
    data
  end
end
