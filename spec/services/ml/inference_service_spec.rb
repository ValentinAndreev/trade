# frozen_string_literal: true

require 'rails_helper'

RSpec.describe Ml::InferenceService do
  let(:model_key) { 'btc_direction_inference' }
  let(:start_time) { Time.utc(2026, 1, 1) }
  let(:candles) do
    [ 100.0, 101.0, 102.0, 103.0, 104.0 ].map.with_index do |close, index|
      {
        time: (start_time + index.minutes).to_i,
        open: close,
        high: close + 1.0,
        low: close - 1.0,
        close:,
        volume: 10.0 + index
      }
    end
  end
  let(:feature_spec) { [ { type: 'log_return', params: { period: 1 } } ] }

  it 'computes missing predictions in batches, persists them, and returns candle-aligned values' do
    _model, run = create_serving_model
    calls = []
    adapter = adapter_returning(calls)

    result = described_class.new(
      model_key:,
      symbol: 'BTCUSD',
      timeframe: '1m',
      candles:,
      outputs: %w[probability confidence],
      batch_size: 2,
      adapter:
    ).call

    expect(result).to be_success
    expect(calls.map(&:length)).to eq([ 2, 2 ])
    expect(MlPrediction.where(ml_training_run_id: run.id).count).to eq(4)
    expect(result.series.length).to eq(candles.length)
    expect(result.series.first.fetch(:values)).to eq('probability' => nil, 'confidence' => nil)
    expect(result.series.last.fetch(:values)).to include('probability' => be_between(0.0, 1.0), 'confidence' => be_between(0.0, 1.0))
    expect(result.diagnostics).to include(
      'requested_cells' => 10,
      'computed_prediction_rows' => 4,
      'reused_prediction_rows' => 0
    )
  end

  it 'reuses persisted predictions when weight and source-window checksums match' do
    model, run = create_serving_model
    rows = inference_rows_for(run)
    complete_rows = rows.select { |row| row.fetch(:complete) }
    repository = Ml::PredictionRepository.new(model:, exchange: 'bitfinex', symbol: 'BTCUSD', timeframe: '1m')
    repository.upsert_predictions(
      training_run: run,
      rows: complete_rows,
      predictions: complete_rows.map { { probability: 0.66, direction: 'up', confidence: 0.32 } },
      weight_checksum: run.weight_checksum
    )
    adapter = instance_double(Ml::Adapters::BaselineDirectionClassifier)
    allow(adapter).to receive(:predict)

    result = described_class.new(
      model_key:,
      symbol: 'BTCUSD',
      timeframe: '1m',
      candles:,
      adapter:
    ).call

    expect(result).to be_success
    expect(adapter).not_to have_received(:predict)
    expect(result.diagnostics).to include('computed_prediction_rows' => 0, 'reused_prediction_rows' => 4)
    expect(result.series.last.fetch(:values)).to eq('probability' => 0.66)
  end

  it 'captures one immutable serving snapshot even if the model is retrained during inference' do
    model, original_run = create_serving_model
    calls = []
    adapter = adapter_returning(calls) do
      create_serving_model(model:, model_key:, payload: 'newer-weights')
    end

    result = described_class.new(
      model_key:,
      symbol: 'BTCUSD',
      timeframe: '1m',
      candles:,
      adapter:
    ).call

    expect(result).to be_success
    expect(MlPrediction.distinct.pluck(:ml_training_run_id)).to eq([ original_run.id ])
    expect(model.reload.latest_successful_training_run_id).not_to eq(original_run.id)
  end

  it 'rejects requests above the prediction cell cap before adapter prediction starts' do
    oversized_candles = (0...16_667).map do |index|
      {
        time: (start_time + index.minutes).to_i,
        open: 100.0,
        high: 101.0,
        low: 99.0,
        close: 100.0 + index,
        volume: 10.0
      }
    end
    adapter = instance_double(Ml::Adapters::BaselineDirectionClassifier)
    allow(adapter).to receive(:predict)

    result = described_class.new(
      model_key:,
      symbol: 'BTCUSD',
      timeframe: '1m',
      candles: oversized_candles,
      outputs: %w[probability direction confidence],
      adapter:
    ).call

    expect(result).not_to be_success
    expect(result.error.code).to eq(:prediction_cell_cap_exceeded)
    expect(result.error.details).to include(requested_cells: 50_001, max_cells: 50_000)
    expect(adapter).not_to have_received(:predict)
  end

  it 'returns structured adapter errors without persisting failed inference rows' do
    create_serving_model
    adapter_error = Ml::Adapters::Result::Error.new(code: :adapter_unavailable, message: 'adapter offline', details: {})
    adapter = instance_double(
      Ml::Adapters::BaselineDirectionClassifier,
      predict: Ml::Adapters::Result::PredictionBatch.new(status: :failed, predictions: [], error: adapter_error)
    )

    result = described_class.new(
      model_key:,
      symbol: 'BTCUSD',
      timeframe: '1m',
      candles:,
      adapter:
    ).call

    expect(result).not_to be_success
    expect(result.error.code).to eq(:adapter_unavailable)
    expect(MlPrediction.count).to eq(0)
  end

  it 'returns cancelled when the cancellation context fires before inference work' do
    create_serving_model
    cancel_check = instance_double('CancelCheck', check_cancelled!: nil)
    allow(cancel_check).to receive(:check_cancelled!).and_raise(Ml::Cancelled)
    adapter = instance_double(Ml::Adapters::BaselineDirectionClassifier)
    allow(adapter).to receive(:predict)

    result = described_class.new(
      model_key:,
      symbol: 'BTCUSD',
      timeframe: '1m',
      candles:,
      cancel_check:,
      adapter:
    ).call

    expect(result.status).to eq(:cancelled)
    expect(adapter).not_to have_received(:predict)
  end

  def create_serving_model(model: nil, model_key: self.model_key, payload: 'weights-v1')
    model ||= create(:ml_model, key: model_key, serving_status: 'draft')
    resolved_feature_spec = Ml::FeatureWindow.new(feature_spec:).resolved_feature_spec
    run = create(
      :ml_training_run,
      :succeeded,
      ml_model: model,
      dataset_spec: {
        symbol: 'BTCUSD',
        exchange: 'bitfinex',
        timeframe: '1m',
        label_horizon: 1,
        feature_spec:
      },
      resolved_feature_spec:,
      hyperparams: { seed: 0 },
      weight_checksum: 'pending-checksum'
    )
    checksum = MlModelWeightBlob.checksum_for(
      training_run: run,
      weights_format: MlModelWeightBlob::BASELINE_FORMAT,
      weights_payload: payload
    )
    run.update!(weight_checksum: checksum)
    create(
      :ml_model_weight_blob,
      ml_training_run: run,
      weights_payload: payload,
      checksum:
    )
    model.update!(
      serving_status: 'trained',
      latest_successful_training_run: run,
      serving_weight_checksum: checksum
    )

    [ model, run ]
  end

  def inference_rows_for(run)
    Ml::DatasetBuilder.new(
      symbol: 'BTCUSD',
      exchange: 'bitfinex',
      timeframe: '1m',
      dataset_spec: run.dataset_spec,
      feature_spec: run.resolved_feature_spec,
      hyperparams: run.hyperparams,
      candles:
    ).build_inference.rows
  end

  def adapter_returning(calls, &before_predict)
    adapter = instance_double(Ml::Adapters::BaselineDirectionClassifier)
    allow(adapter).to receive(:predict) do |features:, weights:|
      before_predict&.call
      calls << features
      predictions = features.map.with_index do |_feature, index|
        probability = 0.55 + (index * 0.01)
        {
          probability:,
          direction: 'up',
          confidence: ((probability - 0.5) * 2.0).round(12)
        }
      end
      Ml::Adapters::Result::PredictionBatch.new(status: :succeeded, predictions:, error: nil)
    end
    adapter
  end
end
