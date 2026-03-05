# frozen_string_literal: true

require 'rails_helper'

RSpec.describe 'Api::Registrations' do
  describe 'POST /api/registration' do
    it 'creates a new user' do
      expect {
        post '/api/registration', params: { username: 'newuser', password: 'secure123' }
      }.to change(User, :count).by(1)

      expect(response).to have_http_status(:created)
      expect(response.parsed_body['user']['username']).to eq('newuser')
    end

    it 'rejects duplicate username' do
      create(:user, username: 'taken')
      post '/api/registration', params: { username: 'taken', password: 'secure123' }
      expect(response).to have_http_status(:unprocessable_entity)
      expect(response.parsed_body['errors']).to include(/already been taken/)
    end

    it 'rejects short password' do
      post '/api/registration', params: { username: 'newuser', password: 'ab' }
      expect(response).to have_http_status(:unprocessable_entity)
    end

    it 'rejects blank username' do
      post '/api/registration', params: { username: '', password: 'secure123' }
      expect(response).to have_http_status(:unprocessable_entity)
    end
  end
end
