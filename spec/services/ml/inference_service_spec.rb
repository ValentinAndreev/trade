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
      'requested_prediction_rows' => 5,
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

  it 'reuses predictions across overlapping requested ranges by loading warmup candles' do
    _model, run = create_serving_model
    candles.each do |candle|
      create(:candle, candle.except(:time).merge(ts: Time.at(candle.fetch(:time)).utc, symbol: 'BTCUSD', exchange: 'bitfinex', timeframe: '1m'))
    end
    first_adapter = adapter_returning([])

    first = described_class.new(
      model_key:,
      symbol: 'BTCUSD',
      timeframe: '1m',
      start_time: Time.at(candles.first.fetch(:time)).utc,
      end_time: Time.at(candles.last.fetch(:time)).utc,
      adapter: first_adapter
    ).call
    second_adapter = instance_double(Ml::Adapters::BaselineDirectionClassifier)
    allow(second_adapter).to receive(:predict)

    second = described_class.new(
      model_key:,
      symbol: 'BTCUSD',
      timeframe: '1m',
      start_time: Time.at(candles[2].fetch(:time)).utc,
      end_time: Time.at(candles.last.fetch(:time)).utc,
      adapter: second_adapter
    ).call

    expect(first).to be_success
    expect(second).to be_success
    expect(second_adapter).not_to have_received(:predict)
    expect(second.series.map { |point| point.fetch(:time) }).to eq(candles[2..].map { |candle| candle.fetch(:time) })
    expect(second.diagnostics).to include('computed_prediction_rows' => 0, 'reused_prediction_rows' => 3)
    expect(MlPrediction.where(ml_training_run_id: run.id).count).to eq(4)
  end

  it 'uses caller-provided candles and loads only the missing warmup prefix' do
    create_serving_model
    candles.each do |candle|
      create(:candle, candle.except(:time).merge(ts: Time.at(candle.fetch(:time)).utc, symbol: 'BTCUSD', exchange: 'bitfinex', timeframe: '1m'))
    end
    adapter = adapter_returning([])
    requested_candles = candles[1..]

    result = described_class.new(
      model_key:,
      symbol: 'BTCUSD',
      timeframe: '1m',
      start_time: Time.at(requested_candles.first.fetch(:time)).utc,
      end_time: Time.at(requested_candles.last.fetch(:time)).utc,
      candles: requested_candles,
      adapter:
    ).call

    expect(result).to be_success
    expect(result.series.map { |point| point.fetch(:time) }).to eq(requested_candles.map { |candle| candle.fetch(:time) })
    expect(result.series.first.fetch(:values).fetch('probability')).to be_between(0.0, 1.0)
    expect(result.diagnostics).to include('loaded_candle_count' => candles.length, 'computed_prediction_rows' => requested_candles.length)
  end

  it 'derives requested boundaries from min and max timestamps for unsorted caller candles' do
    create_serving_model
    adapter = adapter_returning([])

    result = described_class.new(
      model_key:,
      symbol: 'BTCUSD',
      timeframe: '1m',
      candles: candles.reverse,
      adapter:
    ).call

    expect(result).to be_success
    expect(result.series.map { |point| point.fetch(:time) }).to eq(candles.map { |candle| candle.fetch(:time) })
  end

  it 'returns the captured snapshot predictions when a newer run has already written the same timestamps' do
    model, original_run = create_serving_model
    newer_seeded = false
    adapter = adapter_returning([]) do
      next if newer_seeded

      _newer_model, newer_run = create_serving_model(model:, model_key:, payload: 'newer-weights')
      rows = inference_rows_for(newer_run).select { |row| row.fetch(:complete) }
      Ml::PredictionRepository.new(model:, exchange: 'bitfinex', symbol: 'BTCUSD', timeframe: '1m').upsert_predictions(
        training_run: newer_run,
        rows:,
        predictions: rows.map { { probability: 0.91, direction: 'up', confidence: 0.82 } },
        weight_checksum: newer_run.weight_checksum
      )
      newer_seeded = true
    end

    result = described_class.new(
      model_key:,
      symbol: 'btcusd',
      timeframe: '1M',
      candles:,
      adapter:
    ).call

    expect(result).to be_success
    expect(result.snapshot.training_run_id).to eq(original_run.id)
    expect(result.series.last.fetch(:values)).to eq('probability' => 0.58)
    expect(MlPrediction.distinct.pluck(:weight_checksum)).to contain_exactly(original_run.weight_checksum, model.reload.serving_weight_checksum)
  end

  it 'diagnoses guarded-upsert source-window mismatches separately from unavailable predictions' do
    model, original_run = create_serving_model
    stale_seeded = false
    adapter = adapter_returning([]) do
      next if stale_seeded

      target_row = inference_rows_for(original_run).reverse.find { |row| row.fetch(:complete) }
      newer_run = create(
        :ml_training_run,
        :succeeded,
        ml_model: model,
        dataset_spec: original_run.dataset_spec,
        resolved_feature_spec: original_run.resolved_feature_spec,
        hyperparams: original_run.hyperparams,
        weight_checksum: original_run.weight_checksum
      )
      create(
        :ml_prediction,
        ml_model: model,
        ml_training_run: newer_run,
        ts: Time.at(target_row.fetch(:time)).utc,
        exchange: 'bitfinex',
        symbol: 'BTCUSD',
        timeframe: '1m',
        weight_checksum: original_run.weight_checksum,
        source_window_checksum: 'stale-source-window'
      )
      stale_seeded = true
    end

    result = described_class.new(
      model_key:,
      symbol: 'BTCUSD',
      timeframe: '1m',
      candles:,
      adapter:
    ).call

    expect(result).to be_success
    mismatch = result.diagnostics.fetch('source_window_mismatches').values.first
    expect(mismatch).to include(
      requested_source_window_checksum: be_present,
      persisted_source_window_checksum: 'stale-source-window'
    )
    expect(result.series.last.fetch(:values)).to eq('probability' => nil)
  end

  it 'rejects requests above the prediction row cap before loading the model snapshot or predicting' do
    oversized_candles = (0...50_001).map do |index|
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
    expect(MlModel).not_to receive(:eager_load)

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
    expect(result.error.details).to include(requested_prediction_rows: 50_001, max_prediction_rows: 50_000)
    expect(adapter).not_to have_received(:predict)
  end

  it 'rejects invalid timeframes as structured errors before loading the model snapshot' do
    adapter = instance_double(Ml::Adapters::BaselineDirectionClassifier)
    allow(adapter).to receive(:predict)
    expect(MlModel).not_to receive(:eager_load)

    result = described_class.new(
      model_key:,
      symbol: 'BTCUSD',
      timeframe: '15min',
      candles:,
      adapter:
    ).call

    expect(result).not_to be_success
    expect(result.error.code).to eq(:invalid_timeframe)
    expect(result.error.details).to include(timeframe: '15min')
    expect(adapter).not_to have_received(:predict)
  end

  it 'rejects zero-duration timeframes before cap preflight division' do
    adapter = instance_double(Ml::Adapters::BaselineDirectionClassifier)
    allow(adapter).to receive(:predict)
    expect(MlModel).not_to receive(:eager_load)

    result = described_class.new(
      model_key:,
      symbol: 'BTCUSD',
      timeframe: '0m',
      start_time:,
      end_time: start_time + 1.minute,
      adapter:
    ).call

    expect(result).not_to be_success
    expect(result.error.code).to eq(:invalid_timeframe)
    expect(result.error.details).to include(timeframe: '0m')
    expect(adapter).not_to have_received(:predict)
  end

  it 'rejects unbounded database-backed ranges before loading the model snapshot' do
    adapter = instance_double(Ml::Adapters::BaselineDirectionClassifier)
    allow(adapter).to receive(:predict)
    expect(MlModel).not_to receive(:eager_load)

    result = described_class.new(
      model_key:,
      symbol: 'BTCUSD',
      timeframe: '1m',
      start_time:,
      adapter:
    ).call

    expect(result).not_to be_success
    expect(result.error.code).to eq(:prediction_range_unbounded)
    expect(result.error.details).to include(missing: [ 'end_time' ])
    expect(adapter).not_to have_received(:predict)
  end

  it 'rejects invalid start_time boundaries as structured errors' do
    adapter = instance_double(Ml::Adapters::BaselineDirectionClassifier)
    allow(adapter).to receive(:predict)
    expect(MlModel).not_to receive(:eager_load)

    result = described_class.new(
      model_key:,
      symbol: 'BTCUSD',
      timeframe: '1m',
      start_time: 'not-a-time',
      end_time: start_time + 1.minute,
      adapter:
    ).call

    expect(result).not_to be_success
    expect(result.error.code).to eq(:invalid_time_boundary)
    expect(result.error.details).to include(field: 'start_time', value: 'not-a-time')
    expect(adapter).not_to have_received(:predict)
  end

  it 'rejects invalid end_time boundaries as structured errors' do
    adapter = instance_double(Ml::Adapters::BaselineDirectionClassifier)
    allow(adapter).to receive(:predict)
    expect(MlModel).not_to receive(:eager_load)

    result = described_class.new(
      model_key:,
      symbol: 'BTCUSD',
      timeframe: '1m',
      start_time:,
      end_time: 'not-a-time',
      adapter:
    ).call

    expect(result).not_to be_success
    expect(result.error.code).to eq(:invalid_time_boundary)
    expect(result.error.details).to include(field: 'end_time', value: 'not-a-time')
    expect(adapter).not_to have_received(:predict)
  end

  it 'rejects serving snapshots that omit the exchange compatibility axis' do
    create_serving_model(
      dataset_spec: {
        symbol: 'BTCUSD',
        timeframe: '1m',
        label_horizon: 1,
        feature_spec:
      }
    )
    adapter = instance_double(Ml::Adapters::BaselineDirectionClassifier)
    allow(adapter).to receive(:predict)

    result = described_class.new(
      model_key:,
      symbol: 'BTCUSD',
      timeframe: '1m',
      exchange: 'bitfinex',
      candles:,
      adapter:
    ).call

    expect(result).not_to be_success
    expect(result.error.code).to eq(:model_dataset_incompatible)
    expect(result.error.details.fetch(:mismatches)).to include(hash_including(field: 'exchange', expected: 'bitfinex', actual: nil))
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

  it 'returns structured adapter exception errors without persisting failed inference rows' do
    create_serving_model
    adapter = instance_double(Ml::Adapters::BaselineDirectionClassifier)
    allow(adapter).to receive(:predict).and_raise(RuntimeError, 'adapter exploded')

    result = described_class.new(
      model_key:,
      symbol: 'BTCUSD',
      timeframe: '1m',
      candles:,
      adapter:
    ).call

    expect(result).not_to be_success
    expect(result.error.code).to eq(:adapter_error)
    expect(result.error.message).to eq('adapter exploded')
    expect(result.error.details).to include(exception_class: 'RuntimeError')
    expect(MlPrediction.count).to eq(0)
  end

  it 'returns structured adapter-invalid-prediction errors without persisting nil tuples' do
    create_serving_model
    adapter = instance_double(
      Ml::Adapters::BaselineDirectionClassifier,
      predict: Ml::Adapters::Result::PredictionBatch.new(
        status: :succeeded,
        predictions: Array.new(4) { { probability: nil, direction: nil, confidence: nil } },
        error: nil
      )
    )

    result = described_class.new(
      model_key:,
      symbol: 'BTCUSD',
      timeframe: '1m',
      candles:,
      adapter:
    ).call

    expect(result).not_to be_success
    expect(result.error.code).to eq(:adapter_invalid_prediction)
    expect(result.error.details).to include(reason: 'missing_fields', fields: %w[probability direction confidence])
    expect(MlPrediction.count).to eq(0)
  end

  it 'returns cancelled when the cancellation context fires before inference work' do
    create_serving_model
    cancel_check = instance_double('CancelCheck', check_cancelled!: nil)
    allow(cancel_check).to receive(:check_cancelled!).and_raise(Research::Cancelled)
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

  it 'returns retrain-required errors when serving feature definitions are stale' do
    resolved_feature_spec = Ml::FeatureWindow.new(feature_spec:).resolved_feature_spec
    resolved_feature_spec.first['definition_checksum'] = 'old-definition-checksum'
    create_serving_model(resolved_feature_spec:)
    adapter = instance_double(Ml::Adapters::BaselineDirectionClassifier)
    allow(adapter).to receive(:predict)

    result = described_class.new(
      model_key:,
      symbol: 'BTCUSD',
      timeframe: '1m',
      candles:,
      adapter:
    ).call

    expect(result).not_to be_success
    expect(result.error.code).to eq(:model_feature_definition_stale)
    expect(result.error.details.fetch(:mismatches).first).to include(code: 'feature_definition_stale')
    expect(adapter).not_to have_received(:predict)
  end

  def create_serving_model(model: nil, model_key: self.model_key, payload: 'weights-v1', resolved_feature_spec: nil, dataset_spec: nil)
    model ||= create(:ml_model, key: model_key, serving_status: 'draft')
    resolved_feature_spec ||= Ml::FeatureWindow.new(feature_spec:).resolved_feature_spec
    dataset_spec ||= {
      symbol: 'BTCUSD',
      exchange: 'bitfinex',
      timeframe: '1m',
      label_horizon: 1,
      feature_spec:
    }
    run = create(
      :ml_training_run,
      :succeeded,
      ml_model: model,
      dataset_spec:,
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
