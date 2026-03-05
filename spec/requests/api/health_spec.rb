# frozen_string_literal: true

require 'rails_helper'

RSpec.describe 'Api::Health' do
  describe 'GET /api/health' do
    it 'returns 204 no content' do
      get '/api/health'
      expect(response).to have_http_status(:no_content)
    end
  end
end
