# frozen_string_literal: true

require 'rails_helper'

RSpec.describe Ml::PredictionRepository do
  let(:model) { create(:ml_model) }
  let(:older_run) { create(:ml_training_run, :succeeded, ml_model: model, weight_checksum: 'older-checksum') }
  let(:newer_run) { create(:ml_training_run, :succeeded, ml_model: model, weight_checksum: 'newer-checksum') }
  let(:repository) { described_class.new(model:, exchange: 'bitfinex', symbol: 'BTCUSD', timeframe: '1m') }
  let(:time) { Time.utc(2026, 1, 1, 0, 1, 0) }
  let(:row) do
    {
      time: time.to_i,
      complete: true,
      source_window_checksum: 'source-window-v1',
      features: { 'log_return' => 0.01 }
    }
  end

  it 'fetches only rows matching the serving checksum and source-window checksum' do
    matching = create(
      :ml_prediction,
      ml_model: model,
      ml_training_run: older_run,
      ts: time,
      timeframe: '1m',
      weight_checksum: older_run.weight_checksum,
      source_window_checksum: 'source-window-v1',
      probability: 0.62
    )
    create(
      :ml_prediction,
      ml_model: model,
      ml_training_run: newer_run,
      ts: time + 1.minute,
      timeframe: '1m',
      weight_checksum: newer_run.weight_checksum,
      source_window_checksum: 'source-window-v1'
    )

    current = repository.fetch_current(rows: [ row ], weight_checksum: older_run.weight_checksum)

    expect(current.keys).to eq([ row.fetch(:time) ])
    expect(current.fetch(row.fetch(:time)).attributes).to eq(matching.attributes)
  end

  it 'treats source-window checksum mismatches as missing' do
    create(
      :ml_prediction,
      ml_model: model,
      ml_training_run: older_run,
      ts: time,
      timeframe: '1m',
      weight_checksum: older_run.weight_checksum,
      source_window_checksum: 'stale-source-window'
    )

    current = repository.fetch_current(rows: [ row ], weight_checksum: older_run.weight_checksum)

    expect(current).to be_empty
    expect(repository.missing_complete_rows(rows: [ row ], current_by_time: current)).to eq([ row ])
  end

  it 'upserts prediction batches and replaces rows for the same or older training run' do
    inserted = repository.upsert_predictions(
      training_run: older_run,
      rows: [ row ],
      predictions: [ { probability: 0.62, direction: 'up', confidence: 0.24 } ],
      weight_checksum: older_run.weight_checksum
    )
    expect(inserted.fetch(row.fetch(:time)).probability).to eq(0.62)

    expect do
      updated = repository.upsert_predictions(
        training_run: older_run,
        rows: [ row ],
        predictions: [ { probability: 0.71, direction: 'up', confidence: 0.42 } ],
        weight_checksum: older_run.weight_checksum
      )
      expect(updated.fetch(row.fetch(:time)).probability).to eq(0.71)
    end.not_to change(MlPrediction, :count)

    prediction = MlPrediction.find_by!(ml_model_id: model.id, ts: time, weight_checksum: older_run.weight_checksum)
    expect(prediction.probability).to eq(0.71)
    expect(prediction.confidence).to eq(0.42)
  end

  it 'keeps older and newer serving snapshots addressable for the same timestamp' do
    older_run
    create(
      :ml_prediction,
      ml_model: model,
      ml_training_run: newer_run,
      ts: time,
      timeframe: '1m',
      weight_checksum: newer_run.weight_checksum,
      source_window_checksum: 'source-window-v2',
      probability: 0.91,
      confidence: 0.82
    )

    repository.upsert_predictions(
      training_run: older_run,
      rows: [ row ],
      predictions: [ { probability: 0.12, direction: 'down', confidence: 0.76 } ],
      weight_checksum: older_run.weight_checksum
    )

    prediction = MlPrediction.find_by!(ml_model_id: model.id, ts: time, weight_checksum: newer_run.weight_checksum)
    expect(prediction.ml_training_run_id).to eq(newer_run.id)
    expect(prediction.weight_checksum).to eq(newer_run.weight_checksum)
    expect(prediction.probability).to eq(0.91)

    older_prediction = repository.fetch_current(rows: [ row ], weight_checksum: older_run.weight_checksum).fetch(row.fetch(:time))
    newer_prediction = repository.fetch_current(
      rows: [ row.merge(source_window_checksum: 'source-window-v2') ],
      weight_checksum: newer_run.weight_checksum
    ).fetch(row.fetch(:time))

    expect(older_prediction.ml_training_run_id).to eq(older_run.id)
    expect(older_prediction.probability).to eq(0.12)
    expect(newer_prediction.ml_training_run_id).to eq(newer_run.id)
    expect(MlPrediction.where(ml_model_id: model.id, ts: time).count).to eq(2)
  end

  it 'orders guarded replacement by training run creation time, not id' do
    same_checksum = 'same-serving-checksum'
    lower_id_newer_run = create(:ml_training_run, :succeeded, ml_model: model, weight_checksum: same_checksum)
    higher_id_older_run = create(:ml_training_run, :succeeded, ml_model: model, weight_checksum: same_checksum)
    lower_id_newer_run.update_columns(created_at: 1.hour.from_now, updated_at: 1.hour.from_now)
    higher_id_older_run.update_columns(created_at: 1.hour.ago, updated_at: 1.hour.ago)

    repository.upsert_predictions(
      training_run: lower_id_newer_run,
      rows: [ row ],
      predictions: [ { probability: 0.91, direction: 'up', confidence: 0.82 } ],
      weight_checksum: same_checksum
    )

    repository.upsert_predictions(
      training_run: higher_id_older_run,
      rows: [ row ],
      predictions: [ { probability: 0.12, direction: 'down', confidence: 0.76 } ],
      weight_checksum: same_checksum
    )

    prediction = MlPrediction.find_by!(ml_model_id: model.id, ts: time, weight_checksum: same_checksum)
    expect(prediction.ml_training_run_id).to eq(lower_id_newer_run.id)
    expect(prediction.probability).to eq(0.91)
    expect(prediction.confidence).to eq(0.82)
  end
end
