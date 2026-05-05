# frozen_string_literal: true

require 'rails_helper'

RSpec.describe 'Api::Ml::TrainingRuns' do
  let!(:user) { create(:user, password: 'password123') }
  let(:valid_payload) do
    {
      model_key: 'btc_direction_api',
      display_name: 'BTC Direction API',
      dataset_spec: {
        symbol: 'BTCUSD',
        exchange: 'bitfinex',
        timeframe: '1m',
        label_horizon: 1
      },
      feature_spec: [
        { type: 'log_return', params: { period: 1 } }
      ],
      hyperparams: { seed: 3, max_iterations: 20 }
    }
  end

  before { sign_in(user) }

  describe 'GET /api/ml/training_runs' do
    it 'requires authentication' do
      delete '/api/session'

      get '/api/ml/training_runs'

      expect(response).to have_http_status(:unauthorized)
    end

    it 'lists recent training runs and supports model_key filtering' do
      included = create(:ml_training_run, ml_model: create(:ml_model, key: 'included_model'))
      create(:ml_training_run, ml_model: create(:ml_model, key: 'other_model'))

      get '/api/ml/training_runs', params: { model_key: 'included_model' }

      expect(response).to have_http_status(:ok)
      expect(response.parsed_body.map { |row| row.fetch('id') }).to eq([ included.id ])
      expect(response.parsed_body.first.dig('model', 'key')).to eq('included_model')
      expect(response.body).not_to include('weights_payload', 'weight_blob')
    end
  end

  describe 'POST /api/ml/training_runs' do
    it 'creates a model and queued training run atomically for a new key' do
      expect {
        post '/api/ml/training_runs', params: valid_payload, as: :json
      }.to change(MlModel, :count).by(1)
        .and change(MlTrainingRun, :count).by(1)

      expect(response).to have_http_status(:created)
      body = response.parsed_body
      expect(body).to include('status' => 'queued')
      expect(body.dig('model', 'key')).to eq('btc_direction_api')
      expect(body.fetch('resolved_feature_spec').first).to include(
        'type' => 'log_return',
        'warmup' => 1,
        'lookahead' => 0
      )
      expect(MlModel.find_by!(key: 'btc_direction_api').serving_status).to eq('training')
    end

    it 'reuses an existing model key' do
      model = create(:ml_model, key: 'btc_direction_api', display_name: 'Existing')

      expect {
        post '/api/ml/training_runs', params: valid_payload, as: :json
      }.not_to change(MlModel, :count)

      expect(response).to have_http_status(:created)
      expect(response.parsed_body.dig('model', 'id')).to eq(model.id)
    end

    it 'normalizes model keys before reusing existing models' do
      model = create(:ml_model, key: 'btc_direction_api', display_name: 'Existing')

      expect {
        post '/api/ml/training_runs',
          params: valid_payload.merge(model_key: ' BTC_DIRECTION_API '),
          as: :json
      }.not_to change(MlModel, :count)

      expect(response).to have_http_status(:created)
      expect(response.parsed_body.dig('model', 'id')).to eq(model.id)
    end

    it 'ignores unpermitted top-level training run attributes' do
      post '/api/ml/training_runs',
        params: valid_payload.merge(status: 'succeeded', weight_checksum: 'bad'),
        as: :json

      expect(response).to have_http_status(:created)
      run = MlTrainingRun.find(response.parsed_body.fetch('id'))
      expect(run.status).to eq('queued')
      expect(run.weight_checksum).to be_nil
    end

    it 'rejects duplicate active runs for the same model' do
      model = create(:ml_model, key: 'btc_direction_api')
      create(:ml_training_run, ml_model: model, status: 'queued')

      expect {
        post '/api/ml/training_runs', params: valid_payload, as: :json
      }.not_to change(MlTrainingRun, :count)

      expect(response).to have_http_status(:conflict)
      expect(response.parsed_body.dig('error', 'code')).to eq('active_training_run_exists')
    end

    it 'rejects invalid feature specs without creating an orphan model' do
      invalid_payload = valid_payload.merge(
        model_key: 'invalid_feature_model',
        feature_spec: [ { type: 'sma', params: { period: 20 } } ]
      )

      expect {
        post '/api/ml/training_runs', params: invalid_payload, as: :json
      }.not_to change(MlModel, :count)

      expect(response).to have_http_status(:unprocessable_entity)
      expect(response.parsed_body.dig('error', 'code')).to eq('missing_metadata')
    end

    it 'rejects missing dataset identity fields' do
      post '/api/ml/training_runs', params: valid_payload.merge(dataset_spec: { symbol: 'BTCUSD' }), as: :json

      expect(response).to have_http_status(:unprocessable_entity)
      expect(response.parsed_body.dig('error', 'code')).to eq('dataset_spec_invalid')
      expect(response.parsed_body.dig('error', 'details', 'missing')).to contain_exactly('exchange', 'timeframe')
    end

    it 'rejects non-positive label horizons' do
      invalid_payload = valid_payload.deep_dup
      invalid_payload[:dataset_spec][:label_horizon] = -1

      post '/api/ml/training_runs', params: invalid_payload, as: :json

      expect(response).to have_http_status(:unprocessable_entity)
      expect(response.parsed_body.dig('error', 'code')).to eq('dataset_spec_invalid')
      expect(response.parsed_body.dig('error', 'details', 'field')).to eq('label_horizon')
    end

    it 'rejects unsupported requested architectures' do
      post '/api/ml/training_runs', params: valid_payload.merge(architecture: 'lnn'), as: :json

      expect(response).to have_http_status(:unprocessable_entity)
      expect(response.parsed_body.dig('error', 'code')).to eq('unsupported_architecture')
      expect(response.parsed_body.dig('error', 'details', 'requested_architecture')).to eq('lnn')
    end

    it 'rejects unsupported requested prediction targets' do
      post '/api/ml/training_runs', params: valid_payload.merge(prediction_target: 'price_regression'), as: :json

      expect(response).to have_http_status(:unprocessable_entity)
      expect(response.parsed_body.dig('error', 'code')).to eq('unsupported_prediction_target')
      expect(response.parsed_body.dig('error', 'details', 'requested_prediction_target')).to eq('price_regression')
    end

    it 'rejects reusing an existing model key with a different stored contract' do
      model = create(:ml_model, key: 'btc_direction_api')
      model.update_columns(architecture: 'legacy_lnn', updated_at: Time.current)

      expect {
        post '/api/ml/training_runs', params: valid_payload, as: :json
      }.not_to change(MlTrainingRun, :count)

      expect(response).to have_http_status(:conflict)
      expect(response.parsed_body.dig('error', 'code')).to eq('model_contract_mismatch')
      expect(response.parsed_body.dig('error', 'details', 'existing', 'architecture')).to eq('legacy_lnn')
      expect(response.parsed_body.dig('error', 'details', 'requested', 'architecture')).to eq('baseline_direction_classifier')
    end
  end

  describe 'POST /api/ml/training_runs/:id/cancel' do
    it 'requests cancellation for an active run' do
      run = create(:ml_training_run, :running)

      post "/api/ml/training_runs/#{run.id}/cancel"

      expect(response).to have_http_status(:ok)
      expect(response.parsed_body['cancellation_requested_at']).to be_present
      expect(run.reload.cancellation_requested_at).to be_present
      expect(run.status).to eq('running')
    end

    it 'cancels queued runs immediately and allows a replacement run' do
      model = create(:ml_model, key: 'btc_direction_api', serving_status: 'training')
      run = create(:ml_training_run, ml_model: model, status: 'queued')

      post "/api/ml/training_runs/#{run.id}/cancel"

      expect(response).to have_http_status(:ok)
      expect(response.parsed_body['status']).to eq('cancelled')
      expect(run.reload.status).to eq('cancelled')
      expect(run.cancellation_requested_at).to be_present
      expect(model.reload.serving_status).to eq('draft')

      expect {
        post '/api/ml/training_runs', params: valid_payload, as: :json
      }.to change(MlTrainingRun, :count).by(1)
      expect(response).to have_http_status(:created)
    end

    it 'rejects cancellation for terminal runs' do
      run = create(:ml_training_run, :succeeded)

      post "/api/ml/training_runs/#{run.id}/cancel"

      expect(response).to have_http_status(:conflict)
      expect(response.parsed_body.dig('error', 'code')).to eq('not_active')
    end

    it 'returns a structured not-found error for unknown training runs' do
      post "/api/ml/training_runs/#{MlTrainingRun.maximum(:id).to_i + 10_000}/cancel"

      expect(response).to have_http_status(:not_found)
      expect(response.parsed_body.dig('error', 'code')).to eq('training_run_not_found')
    end
  end
end
