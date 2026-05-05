# frozen_string_literal: true

class MlTrainingRun < ApplicationRecord
  STATUSES = %w[queued running succeeded failed cancelled].freeze
  ACTIVE_STATUSES = %w[queued running].freeze
  TERMINAL_STATUSES = %w[succeeded failed cancelled].freeze
  CANONICAL_METRIC_KEYS = MlModel::CANONICAL_METRIC_KEYS

  belongs_to :ml_model, inverse_of: :training_runs
  has_one :weight_blob,
    class_name: 'MlModelWeightBlob',
    dependent: :restrict_with_error,
    inverse_of: :ml_training_run

  before_validation :normalize_status
  before_validation :normalize_json_snapshots

  validates :status, presence: true, inclusion: { in: STATUSES }
  validates :seed, numericality: { only_integer: true }
  validates :duration_ms, numericality: { only_integer: true, greater_than_or_equal_to: 0 }, allow_nil: true
  validates :weight_checksum, length: { maximum: 128 }, allow_nil: true
  validates :ml_model_id,
    uniqueness: {
      conditions: -> { where(status: ACTIVE_STATUSES) },
      message: 'already has an active training run'
    },
    if: :active?

  validate :json_snapshots_are_present
  validate :succeeded_run_has_weight_checksum
  validate :cancelled_run_has_no_weight_checksum

  scope :active, -> { where(status: ACTIVE_STATUSES) }
  scope :terminal, -> { where(status: TERMINAL_STATUSES) }
  scope :recent, -> { order(created_at: :desc, id: :desc) }

  def self.canonical_metrics(metrics = {})
    MlModel.canonical_metric_summary(metrics)
  end

  def active? = status.in?(ACTIVE_STATUSES)

  def terminal? = status.in?(TERMINAL_STATUSES)

  def cancellation_requested? = cancellation_requested_at.present?

  def request_cancellation!
    update!(cancellation_requested_at: Time.current)
  end

  private

  def normalize_status
    self.status = status.to_s.strip if status.present?
  end

  def normalize_json_snapshots
    self.dataset_spec = dataset_spec.to_h.deep_stringify_keys
    self.resolved_feature_spec = Array(resolved_feature_spec).map { |entry| entry.to_h.deep_stringify_keys }
    self.hyperparams = hyperparams.to_h.deep_stringify_keys
    self.metrics = self.class.canonical_metrics(metrics)
    self.error_metadata = error_metadata.to_h.deep_stringify_keys
    self.fitted_metadata = fitted_metadata.to_h.deep_stringify_keys
  end

  def json_snapshots_are_present
    errors.add(:dataset_spec, "can't be nil") if dataset_spec.nil?
    errors.add(:resolved_feature_spec, "can't be nil") if resolved_feature_spec.nil?
    errors.add(:hyperparams, "can't be nil") if hyperparams.nil?
    errors.add(:metrics, "can't be nil") if metrics.nil?
    errors.add(:error_metadata, "can't be nil") if error_metadata.nil?
    errors.add(:fitted_metadata, "can't be nil") if fitted_metadata.nil?
  end

  def succeeded_run_has_weight_checksum
    return unless status == 'succeeded' && weight_checksum.blank?

    errors.add(:weight_checksum, "can't be blank for a succeeded training run")
  end

  def cancelled_run_has_no_weight_checksum
    return unless status == 'cancelled' && weight_checksum.present?

    errors.add(:weight_checksum, 'must be blank for a cancelled training run')
  end
end
