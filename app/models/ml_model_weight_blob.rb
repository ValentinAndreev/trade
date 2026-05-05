# frozen_string_literal: true

require 'base64'
require 'digest'
require 'json'

class MlModelWeightBlob < ApplicationRecord
  MAX_BYTE_SIZE = 16.megabytes
  BASELINE_FORMAT = 'baseline_direction_classifier:v1'
  SUPPORTED_FORMATS = [ BASELINE_FORMAT ].freeze
  ADAPTER_SCHEMA_VERSION = 'ml-adapter-schema:v1'

  belongs_to :ml_training_run

  before_validation :sync_byte_size
  before_validation :sync_checksum

  validates :ml_training_run_id, uniqueness: true
  validates :weights_format, presence: true, inclusion: { in: SUPPORTED_FORMATS }
  validates :weights_payload, presence: true
  validates :byte_size,
    numericality: { only_integer: true, greater_than: 0, less_than_or_equal_to: MAX_BYTE_SIZE }
  validates :checksum, presence: true, uniqueness: true, length: { maximum: 128 }

  validate :training_run_succeeded
  validate :byte_size_matches_payload
  validate :checksum_matches_snapshot

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

  def sync_checksum
    return if checksum.present? || ml_training_run.blank? || weights_format.blank? || weights_payload.blank?

    self.checksum = self.class.checksum_for(
      training_run: ml_training_run,
      weights_format: weights_format,
      weights_payload: weights_payload
    )
  end

  def training_run_succeeded
    return if ml_training_run.blank? || ml_training_run.status == 'succeeded'

    errors.add(:ml_training_run, 'must be succeeded before weights are stored')
  end

  def byte_size_matches_payload
    return if weights_payload.blank? || byte_size == payload_bytes

    errors.add(:byte_size, 'must match weights payload byte size')
  end

  def checksum_matches_snapshot
    return if ml_training_run.blank? || weights_format.blank? || weights_payload.blank? || checksum.blank?

    expected = self.class.checksum_for(
      training_run: ml_training_run,
      weights_format: weights_format,
      weights_payload: weights_payload
    )
    errors.add(:checksum, 'does not match canonical training run snapshot') unless checksum == expected
  end
end
