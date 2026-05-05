# frozen_string_literal: true

require 'rails_helper'

RSpec.describe 'Api::Ml::Models' do
  let!(:user) { create(:user, password: 'password123') }

  before { sign_in(user) }

  describe 'GET /api/ml/models' do
    it 'requires authentication' do
      delete '/api/session'

      get '/api/ml/models'

      expect(response).to have_http_status(:unauthorized)
    end

    it 'lists global models capped to 50 entries' do
      create_list(:ml_model, 55)

      get '/api/ml/models', params: { limit: 100 }

      expect(response).to have_http_status(:ok)
      expect(response.parsed_body.length).to eq(50)
    end

    it 'serializes serving and latest failed state without weight blobs' do
      model = create(:ml_model, key: 'btc_direction_model')
      success = create(:ml_training_run, :succeeded, ml_model: model)
      blob = create(:ml_model_weight_blob, ml_training_run: success)
      failure = create(:ml_training_run, :failed, ml_model: model)
      model.update!(
        serving_status: 'trained',
        latest_successful_training_run: success,
        latest_failed_training_run: failure,
        serving_weight_checksum: blob.checksum,
        metric_summary: success.metrics
      )

      get '/api/ml/models'

      expect(response).to have_http_status(:ok)
      body = response.parsed_body.first
      expect(body).to include(
        'key' => 'btc_direction_model',
        'serving_status' => 'trained',
        'serving_weight_checksum' => blob.checksum
      )
      expect(body.dig('latest_successful_training_run', 'id')).to eq(success.id)
      expect(body.dig('latest_failed_training_run', 'id')).to eq(failure.id)
      expect(response.body).not_to include('weights_payload', 'weight_blob', 'ml_model_weight_blob')
    end

    it 'exposes active run state separately from serving weights' do
      model = create(:ml_model, key: 'active_model')
      active_run = create(:ml_training_run, ml_model: model, status: 'running')

      get '/api/ml/models'

      expect(response).to have_http_status(:ok)
      expect(response.parsed_body.first.dig('active_training_run', 'id')).to eq(active_run.id)
    end
  end

  describe 'DELETE /api/ml/models/:id' do
    it 'does not expose destructive deletion in 017' do
      model = create(:ml_model)

      delete "/api/ml/models/#{model.id}"

      expect(response).to have_http_status(:not_found)
      expect(MlModel.exists?(model.id)).to be(true)
    end
  end
end
