# frozen_string_literal: true

require 'rails_helper'

RSpec.describe 'Api::Ml::Predictions' do
  let!(:user) { create(:user, password: 'password123') }
  let(:start_time) { Time.utc(2026, 1, 1, 0, 0, 0) }
  let(:end_time) { start_time + 2.minutes }
  let(:base_payload) do
    {
      symbol: 'BTCUSD',
      timeframe: '1m',
      start_time: start_time.iso8601,
      end_time: end_time.iso8601,
      columns: [
        { column_id: 'prob_col', model_key: 'btc_direction_api', model_output: 'probability' }
      ]
    }
  end

  before do
    sign_in(user)
    create_candles(exchange: 'bitfinex')
  end

  it 'requires authentication' do
    delete '/api/session'

    post '/api/ml/predictions', params: base_payload, as: :json

    expect(response).to have_http_status(:unauthorized)
    expect(response.parsed_body.fetch('error')).to include(
      'code' => 'unauthorized',
      'message' => 'Unauthorized',
      'details' => {}
    )
  end

  it 'returns prediction limits without loading model rows' do
    expect(MlModel).not_to receive(:by_key)

    get '/api/ml/predictions/limits'

    expect(response).to have_http_status(:ok)
    expect(response.parsed_body).to eq(
      'max_prediction_rows' => Ml::PredictionRepository::MAX_CELLS
    )
  end

  it 'requires authentication for prediction limits' do
    delete '/api/session'

    get '/api/ml/predictions/limits'

    expect(response).to have_http_status(:unauthorized)
    expect(response.parsed_body.fetch('error')).to include(
      'code' => 'unauthorized',
      'message' => 'Unauthorized',
      'details' => {}
    )
  end

  it 'defaults exchange through the shared candle query default and echoes it' do
    calls = stub_successful_inference

    post '/api/ml/predictions', params: base_payload, as: :json

    expect(response).to have_http_status(:ok)
    expect(response.parsed_body).to include('exchange' => Candle::FindQuery::DEFAULT_EXCHANGE)
    expect(calls.first.fetch(:exchange)).to eq(Candle::FindQuery::DEFAULT_EXCHANGE)
  end

  it 'passes explicit exchange into inference' do
    create_candles(exchange: 'kraken')
    calls = stub_successful_inference

    post '/api/ml/predictions', params: base_payload.merge(exchange: 'kraken'), as: :json

    expect(response).to have_http_status(:ok)
    expect(response.parsed_body).to include('exchange' => 'kraken')
    expect(calls.first.fetch(:exchange)).to eq('kraken')
  end

  it 'rejects invalid timeframes before inference starts' do
    allow(Ml::InferenceService).to receive(:new)

    post '/api/ml/predictions', params: base_payload.merge(timeframe: '0m'), as: :json

    expect(response).to have_http_status(:unprocessable_entity)
    expect(response.parsed_body.dig('error', 'code')).to eq('invalid_timeframe')
    expect(Ml::InferenceService).not_to have_received(:new)
  end

  it 'rejects over-cap requests using candle_count times distinct model keys' do
    allow(Ml::InferenceService).to receive(:new)
    oversized = base_payload.merge(
      end_time: (start_time + 25_000.minutes).iso8601,
      columns: [
        { column_id: 'a_prob', model_key: 'model_a', model_output: 'probability' },
        { column_id: 'a_conf', model_key: 'model_a', model_output: 'confidence' },
        { column_id: 'b_prob', model_key: 'model_b', model_output: 'probability' }
      ]
    )

    post '/api/ml/predictions', params: oversized, as: :json

    expect(response).to have_http_status(:unprocessable_entity)
    details = response.parsed_body.dig('error', 'details')
    expect(details).to include(
      'requested_prediction_rows' => 50_002,
      'max_prediction_rows' => Ml::PredictionRepository::MAX_CELLS,
      'candle_count' => 25_001,
      'distinct_requested_models' => 2
    )
    expect(details.fetch('requested_outputs_by_model')).to eq(
      'model_a' => %w[probability confidence],
      'model_b' => [ 'probability' ]
    )
    expect(Ml::InferenceService).not_to have_received(:new)
  end

  it 'deduplicates duplicate model/output columns for inference and projects both columns' do
    calls = stub_successful_inference
    payload = base_payload.merge(
      columns: [
        { column_id: 'prob_a', model_key: 'btc_direction_api', model_output: 'probability' },
        { column_id: 'prob_b', model_key: 'btc_direction_api', model_output: 'probability' }
      ]
    )

    post '/api/ml/predictions', params: payload, as: :json

    expect(response).to have_http_status(:ok)
    expect(calls.length).to eq(1)
    expect(calls.first.fetch(:outputs)).to eq([ 'probability' ])
    expect(response.parsed_body.fetch('values').keys).to contain_exactly('prob_a', 'prob_b')
  end

  it 'returns partial timestamp values and leaves missing predictions nil' do
    stub_successful_inference do |point_index, output|
      next if point_index == 1

      output == 'confidence' ? 0.8 : 0.7
    end

    post '/api/ml/predictions',
      params: base_payload.merge(columns: [ { column_id: 'conf_col', model_key: 'btc_direction_api', model_output: 'confidence' } ]),
      as: :json

    expect(response).to have_http_status(:ok)
    values = response.parsed_body.dig('values', 'conf_col')
    expect(values.fetch(start_time.to_i.to_s)).to eq(0.8)
    expect(values.fetch((start_time + 1.minute).to_i.to_s)).to be_nil
  end

  it 'keeps invalid model columns local and does not start inference for them' do
    allow(Ml::InferenceService).to receive(:new)

    post '/api/ml/predictions',
      params: base_payload.merge(columns: [ { column_id: 'bad_model', model_key: "x';drop_table", model_output: 'probability' } ]),
      as: :json

    expect(response).to have_http_status(:ok)
    expect(response.parsed_body.dig('errors', 'bad_model', 'code')).to eq('invalid_model_key')
    expect(response.parsed_body.dig('values', 'bad_model').values).to all(be_nil)
    expect(Ml::InferenceService).not_to have_received(:new)
  end

  it 'does not accept camelCase column aliases' do
    allow(Ml::InferenceService).to receive(:new)

    post '/api/ml/predictions',
      params: base_payload.merge(columns: [ { columnId: 'prob_col', modelKey: 'btc_direction_api', modelOutput: 'probability' } ]),
      as: :json

    expect(response).to have_http_status(:bad_request)
    expect(response.parsed_body.dig('error', 'code')).to eq('missing_column_id')
    expect(Ml::InferenceService).not_to have_received(:new)
  end

  it 'rejects malformed column entries before inference starts' do
    allow(Ml::InferenceService).to receive(:new)

    post '/api/ml/predictions',
      params: base_payload.merge(columns: [ 'bad' ]),
      as: :json

    expect(response).to have_http_status(:bad_request)
    expect(response.parsed_body.dig('error', 'code')).to eq('invalid_columns')
    expect(response.parsed_body.dig('error', 'details', 'index')).to eq(0)
    expect(Ml::InferenceService).not_to have_received(:new)
  end

  it 'keeps failed serving model errors local to the column' do
    allow(Ml::InferenceService).to receive(:new).and_return(instance_double(Ml::InferenceService, call: failed_result(:unknown_model)))

    post '/api/ml/predictions', params: base_payload, as: :json

    expect(response).to have_http_status(:ok)
    expect(response.parsed_body.dig('errors', 'prob_col', 'code')).to eq('unknown_model')
    expect(response.parsed_body.dig('values', 'prob_col').values).to all(be_nil)
  end

  it 'surfaces source-window mismatch diagnostics per column' do
    stub_successful_inference(source_window_mismatches: { start_time.to_i.to_s => { 'requested_source_window_checksum' => 'new' } })

    post '/api/ml/predictions', params: base_payload, as: :json

    expect(response).to have_http_status(:ok)
    expect(response.parsed_body.dig('diagnostics', 'source_window_mismatches_by_column', 'prob_col')).to eq(
      start_time.to_i.to_s => { 'requested_source_window_checksum' => 'new' }
    )
  end

  it 'rejects a concurrent grid prediction request for the same session' do
    allow(Api::Ml::PredictionsController).to receive(:reserve_request_guard!).and_return(false)
    allow(Ml::InferenceService).to receive(:new)

    post '/api/ml/predictions', params: base_payload, as: :json

    expect(response).to have_http_status(:too_many_requests)
    expect(response.parsed_body.dig('error', 'code')).to eq('grid_prediction_request_in_progress')
    expect(response.parsed_body.dig('error', 'details', 'retryable')).to be(true)
    expect(Ml::InferenceService).not_to have_received(:new)
  end

  def create_candles(exchange:)
    (0..2).each do |index|
      create(
        :candle,
        exchange:,
        timeframe: '1m',
        symbol: 'BTCUSD',
        ts: start_time + index.minutes,
        open: 100.0 + index,
        high: 101.0 + index,
        low: 99.0 + index,
        close: 100.5 + index,
        volume: 10.0 + index
      )
    end
  end

  def stub_successful_inference(source_window_mismatches: {}, &value_for)
    calls = []
    allow(Ml::InferenceService).to receive(:new) do |**kwargs|
      calls << kwargs
      service = instance_double(Ml::InferenceService)
      allow(service).to receive(:call).and_return(success_result(kwargs.fetch(:candles), kwargs.fetch(:outputs), source_window_mismatches:, &value_for))
      service
    end
    calls
  end

  def success_result(candles, outputs, source_window_mismatches:)
    series = candles.map.with_index do |candle, index|
      {
        time: candle.fetch(:time),
        complete: true,
        values: outputs.index_with { |output| block_given? ? yield(index, output) : prediction_value(index, output) }
      }
    end
    Ml::InferenceService::Result.new(
      status: :succeeded,
      model: nil,
      snapshot: nil,
      series:,
      diagnostics: {
        'candle_count' => candles.length,
        'source_window_mismatches' => source_window_mismatches
      },
      error: nil
    )
  end

  def prediction_value(index, output)
    output == 'direction' ? 'up' : (0.6 + (index * 0.01)).round(2)
  end

  def failed_result(code)
    Ml::InferenceService::Result.new(
      status: :failed,
      model: nil,
      snapshot: nil,
      series: [],
      diagnostics: { 'status' => 'failed', 'error_code' => code.to_s },
      error: Ml::InferenceService::Error.new(code:, message: code.to_s.humanize, details: {})
    )
  end
end
