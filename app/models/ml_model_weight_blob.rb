# frozen_string_literal: true

require 'base64'
require 'digest'
require 'json'

class MlModelWeightBlob < ApplicationRecord
  MAX_BYTE_SIZE = 16.megabytes
  BASELINE_FORMAT = 'baseline_direction_classifier:v1'
  SUPPORTED_FORMATS = [ BASELINE_FORMAT ].freeze
  ADAPTER_SCHEMA_VERSION = 'ml-adapter-schema:v1'

  before_validation :sync_byte_size

  validates :weights_format, presence: true, inclusion: { in: SUPPORTED_FORMATS }
  validates :weights_payload, presence: true
  validates :byte_size,
    numericality: { only_integer: true, greater_than: 0, less_than_or_equal_to: MAX_BYTE_SIZE }
  validates :checksum,
    presence: true,
    format: { with: /\A[0-9a-f]{64}\z/, message: 'must be a SHA-256 hex digest' }

  validate :byte_size_matches_payload

  def self.checksum_for(training_run:, weights_format:, weights_payload:)
    Digest::SHA256.hexdigest(canonical_snapshot_json(training_run:, weights_format:, weights_payload:))
  end

  def self.canonical_snapshot_json(training_run:, weights_format:, weights_payload:)
    JSON.generate(
      deep_sort(
        {
          dataset_spec: training_run.dataset_spec,
          resolved_feature_spec: training_run.resolved_feature_spec,
          fitted_metadata: training_run.fitted_metadata,
          hyperparams: training_run.hyperparams,
          seed: training_run.seed,
          adapter_schema_version: ADAPTER_SCHEMA_VERSION,
          weights_format: weights_format,
          serialized_weights: Base64.strict_encode64(weights_payload.to_s.b)
        }
      )
    )
  end

  def self.deep_sort(value)
    case value
    when Hash
      value.to_h.stringify_keys.sort.to_h { |key, nested| [ key, deep_sort(nested) ] }
    when Array
      value.map { |nested| deep_sort(nested) }
    else
      value
    end
  end
  private_class_method :canonical_snapshot_json, :deep_sort

  def payload_bytes
    weights_payload.to_s.b.bytesize
  end

  private

  def sync_byte_size
    self.byte_size = payload_bytes if weights_payload.present?
  end

  def byte_size_matches_payload
    return if weights_payload.blank? || byte_size == payload_bytes

    errors.add(:byte_size, 'must match weights payload byte size')
  end
end
