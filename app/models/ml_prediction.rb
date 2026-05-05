# frozen_string_literal: true

class MlPrediction < ApplicationRecord
  self.primary_key = nil
  self.implicit_order_column = 'ts'

  OUTPUTS = %w[probability direction confidence].freeze
  DIRECTIONS = %w[up down].freeze

  # Prediction writes intentionally go through Ml::PredictionRepository raw SQL.
  # Keep value invariants in database NOT NULL/CHECK constraints, not AR validations.

  scope :for_identity, ->(ml_model_id:, exchange:, symbol:, timeframe:) do
    where(ml_model_id:, exchange:, symbol:, timeframe:)
  end
  scope :ordered, -> { order(ts: :asc) }
end
