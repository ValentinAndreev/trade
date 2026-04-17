# frozen_string_literal: true

class LlmSetting < ApplicationRecord
  belongs_to :user

  encrypts :api_key

  before_validation :normalize_launch_fields

  validates :provider, presence: true, inclusion: { in: ->(*) { Llm::ProviderCatalog.values } }
  validates :provider, uniqueness: { scope: :user_id }
  validates :model, presence: true, length: { maximum: 120 }
  validates :temperature, numericality: { greater_than_or_equal_to: 0, less_than_or_equal_to: 2 }
  validates :max_output_tokens, numericality: { only_integer: true, greater_than: 0, less_than_or_equal_to: 128_000 }

  def as_api_json
    {
      provider:,
      model:,
      api_base:,
      temperature: temperature.to_f,
      max_output_tokens:,
      api_key_present: api_key.present?,
      api_key_required: Llm::ProviderCatalog.api_key_required?(provider, api_base),
      launch_config: provider.to_s == 'llama' ? normalized_launch_config : {}
    }
  end

  private

  def normalize_launch_fields
    self.launch_config = provider.to_s == 'llama' ? normalized_launch_config : {}
    self.launch_state = launch_state.to_h.deep_stringify_keys

    return unless provider.to_s == 'llama'

    self.api_base = Llm::LlamaServerManager.build_api_base(launch_config)
  end

  def normalized_launch_config
    Llm::LlamaServerManager.normalize_config(launch_config)
  rescue StandardError => e
    Rails.logger.warn("LlmSetting#normalized_launch_config failed (id=#{id}): #{e.message}")
    Llm::LlamaServerManager.normalize_config({})
  end
end
