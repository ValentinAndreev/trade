# frozen_string_literal: true

class MlPrediction < ApplicationRecord
  self.primary_key = nil
  self.implicit_order_column = 'ts'

  IDENTITY_FIELDS = %i[ml_model_id exchange symbol timeframe ts].freeze
  OUTPUTS = %w[probability direction confidence].freeze
  DIRECTIONS = %w[up down].freeze
  UPSERT_UPDATE_FIELDS = %i[
    ml_training_run_id
    weight_checksum
    source_window_checksum
    output
    probability
    direction
    confidence
    updated_at
  ].freeze

  validates :ts, :ml_model_id, :ml_training_run_id, :exchange, :symbol, :timeframe,
    :weight_checksum, :source_window_checksum, :output, :probability, :direction,
    :confidence, presence: true
  validates :output, inclusion: { in: OUTPUTS }
  validates :direction, inclusion: { in: DIRECTIONS }
  validates :probability, :confidence,
    numericality: { greater_than_or_equal_to: 0, less_than_or_equal_to: 1 }

  scope :for_identity, ->(ml_model_id:, exchange:, symbol:, timeframe:) do
    where(ml_model_id:, exchange:, symbol:, timeframe:)
  end
  scope :in_range, ->(from, to) { where(ts: from..to) }
  scope :ordered, -> { order(ts: :asc) }

  class << self
    def upsert_predictions(records)
      return ActiveRecord::Result.new([], []) if records.empty?

      upsert_all( # rubocop:disable Rails/SkipsModelValidations
        with_timestamps(records),
        unique_by: :index_ml_predictions_identity,
        update_only: UPSERT_UPDATE_FIELDS,
        record_timestamps: false
      )
    end

    private

    def with_timestamps(records)
      now = Time.current
      records.map do |record|
        record.to_h.merge(
          created_at: record[:created_at] || record['created_at'] || now,
          updated_at: now
        )
      end
    end
  end
end
