# frozen_string_literal: true

FactoryBot.define do
  factory :ml_prediction do
    transient do
      ml_model { create(:ml_model) }
      ml_training_run { create(:ml_training_run, :succeeded, ml_model: ml_model) }
    end

    ts { Time.utc(2026, 1, 1, 0, 0, 0) }
    ml_model_id { ml_model.id }
    ml_training_run_id { ml_training_run.id }
    exchange { 'bitfinex' }
    symbol { 'BTCUSD' }
    timeframe { '1h' }
    weight_checksum { ml_training_run.weight_checksum }
    source_window_checksum { 'source-window-sha256' }
    probability { 0.62 }
    direction { 'up' }
    confidence { 0.24 }
  end
end
