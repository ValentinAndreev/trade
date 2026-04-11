# frozen_string_literal: true

class Preset < ApplicationRecord
  belongs_to :user

  validates :name, presence: true, uniqueness: { scope: :user_id }
  validates :payload, presence: true
end
