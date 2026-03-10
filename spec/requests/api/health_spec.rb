# frozen_string_literal: true

require 'rails_helper'

RSpec.describe 'Api::Health' do
  describe 'GET /api/health' do
    it 'returns 200 with bitfinex status' do
      allow(Utils::BitfinexHealth).to receive(:reachable?).and_return(true)
      get '/api/health'
      expect(response).to have_http_status(:ok)
      expect(response.parsed_body).to eq({ 'bitfinex' => true })
    end

    it 'reports bitfinex unreachable when check fails' do
      allow(Utils::BitfinexHealth).to receive(:reachable?).and_return(false)
      get '/api/health'
      expect(response).to have_http_status(:ok)
      expect(response.parsed_body).to eq({ 'bitfinex' => false })
    end
  end
end
