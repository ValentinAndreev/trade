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
    end
  end

  describe 'POST /api/ml/training_runs/:id/cancel' do
    it 'requests cancellation for an active run' do
      run = create(:ml_training_run, status: 'queued')

      post "/api/ml/training_runs/#{run.id}/cancel"

      expect(response).to have_http_status(:ok)
      expect(response.parsed_body['cancellation_requested_at']).to be_present
      expect(run.reload.cancellation_requested_at).to be_present
    end

    it 'rejects cancellation for terminal runs' do
      run = create(:ml_training_run, :succeeded)

      post "/api/ml/training_runs/#{run.id}/cancel"

      expect(response).to have_http_status(:conflict)
      expect(response.parsed_body.dig('error', 'code')).to eq('not_active')
    end
  end
end
