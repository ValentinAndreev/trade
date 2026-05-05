# frozen_string_literal: true

class MlModel < ApplicationRecord
  SERVING_STATUSES = %w[draft training trained failed disabled].freeze
  ARCHITECTURES = %w[baseline_direction_classifier].freeze
  PREDICTION_TARGETS = %w[direction_classification].freeze
  CANONICAL_METRIC_KEYS = %w[accuracy log_loss auc baseline_majority].freeze
  IMMUTABLE_AFTER_SUCCESSFUL_TRAINING = %w[key display_name architecture prediction_target].freeze

  has_many :training_runs,
    class_name: 'MlTrainingRun',
    dependent: :restrict_with_error,
    inverse_of: :ml_model

  belongs_to :latest_successful_training_run,
    class_name: 'MlTrainingRun',
    optional: true

  belongs_to :latest_failed_training_run,
    class_name: 'MlTrainingRun',
    optional: true

  before_validation :normalize_key
  before_validation :normalize_metric_summary

  validates :key,
    presence: true,
    uniqueness: true,
    length: { maximum: 120 },
    format: { with: /\A[a-z0-9][a-z0-9_-]*\z/ }
  validates :display_name, presence: true, length: { maximum: 160 }
  validates :architecture, presence: true, length: { maximum: 120 }, inclusion: { in: ARCHITECTURES }
  validates :prediction_target, presence: true, length: { maximum: 120 }, inclusion: { in: PREDICTION_TARGETS }
  validates :serving_status, presence: true, inclusion: { in: SERVING_STATUSES }
  validates :serving_weight_checksum, length: { maximum: 128 }, allow_nil: true

  validate :identity_fields_immutable_after_successful_training, on: :update

  scope :by_key, -> { order(:key) }

  def self.canonical_metric_summary(metrics = {})
    source = metrics.to_h.stringify_keys
    CANONICAL_METRIC_KEYS.index_with { |key| source.key?(key) ? source[key] : nil }
  end

  def trained?
    serving_status == 'trained' && latest_successful_training_run_id.present?
  end

  private

  def normalize_key
    self.key = key.to_s.strip.downcase if key.present?
  end

  def normalize_metric_summary
    self.metric_summary = self.class.canonical_metric_summary(metric_summary)
  end

  def identity_fields_immutable_after_successful_training
    return unless latest_successful_training_run_id_in_database.present?

    changed_fields = IMMUTABLE_AFTER_SUCCESSFUL_TRAINING.select do |field|
      will_save_change_to_attribute?(field)
    end
    return if changed_fields.empty?

    errors.add(:base, "trained model identity is immutable: #{changed_fields.join(', ')}")
  end
end
