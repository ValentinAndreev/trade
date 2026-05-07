# frozen_string_literal: true

class MlPrediction < ApplicationRecord
  self.primary_key = nil
  self.implicit_order_column = 'ts'

  OUTPUTS = %w[probability direction confidence].freeze
  DIRECTIONS = %w[up down].freeze

  # Timescale hypertable without an AR primary key. Identity is enforced by the
  # unique prediction index, and writes go through Ml::PredictionRepository SQL.
  # Keep value invariants in database NOT NULL/CHECK constraints, not AR validations.

  scope :for_identity, ->(ml_model_id:, exchange:, symbol:, timeframe:) do
    where(ml_model_id:, exchange:, symbol:, timeframe:)
  end
  scope :ordered, -> { order(ts: :asc) }
end
