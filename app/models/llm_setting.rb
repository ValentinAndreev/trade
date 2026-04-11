# frozen_string_literal: true

class LlmSetting < ApplicationRecord
  PROVIDERS = %w[
    openai
    anthropic
    gemini
    openrouter
    mistral
    xai
    perplexity
    deepseek
  ].freeze

  belongs_to :user

  encrypts :api_key

  validates :provider, presence: true, inclusion: { in: PROVIDERS }
  validates :provider, uniqueness: { scope: :user_id }
  validates :model, presence: true, length: { maximum: 120 }
  validates :temperature, numericality: { greater_than_or_equal_to: 0, less_than_or_equal_to: 2 }
  validates :max_output_tokens, numericality: { only_integer: true, greater_than: 0, less_than_or_equal_to: 128_000 }

  def as_api_json
    {
      provider: provider,
      model: model,
      api_base: api_base,
      temperature: temperature.to_f,
      max_output_tokens: max_output_tokens,
      api_key_present: api_key.present?
    }
  end
end
