# frozen_string_literal: true

require 'rails_helper'

RSpec.describe 'Api::Sessions' do
  let!(:user) { create(:user, username: 'alice', password: 'password123') }

  describe 'POST /api/session' do
    it 'logs in with valid credentials' do
      post '/api/session', params: { username: 'alice', password: 'password123' }
      expect(response).to have_http_status(:ok)

      json = response.parsed_body
      expect(json['user']['username']).to eq('alice')
      expect(json['user']['presets']).to be_an(Array)
    end

    it 'rejects invalid password' do
      post '/api/session', params: { username: 'alice', password: 'wrong' }
      expect(response).to have_http_status(:unauthorized)
      expect(response.parsed_body['error']).to include('Invalid')
    end

    it 'rejects unknown username' do
      post '/api/session', params: { username: 'nobody', password: 'pass' }
      expect(response).to have_http_status(:unauthorized)
    end
  end

  describe 'GET /api/session' do
    it 'returns current user when logged in' do
      sign_in(user)
      get '/api/session'
      expect(response).to have_http_status(:ok)
      expect(response.parsed_body['user']['username']).to eq('alice')
    end

    it 'returns null user when not logged in' do
      get '/api/session'
      expect(response).to have_http_status(:ok)
      expect(response.parsed_body['user']).to be_nil
    end
  end

  describe 'DELETE /api/session' do
    it 'logs out' do
      sign_in(user)
      delete '/api/session'
      expect(response).to have_http_status(:ok)

      get '/api/session'
      expect(response.parsed_body['user']).to be_nil
    end
  end
end
