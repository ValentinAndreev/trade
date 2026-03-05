# frozen_string_literal: true

require 'rails_helper'

RSpec.describe 'Api::Dashboards', :symbol_store do
  describe 'POST /api/dashboard/add' do
    it 'adds a known symbol' do
      symbol = BitfinexConfig.symbols.first
      post '/api/dashboard/add', params: { symbol: symbol }
      expect(response).to have_http_status(:ok)
      expect(response.parsed_body['symbols']).to include(symbol)
    end

    it 'rejects unknown symbol' do
      post '/api/dashboard/add', params: { symbol: 'FAKEUSD' }
      expect(response).to have_http_status(:bad_request)
      expect(response.parsed_body['error']).to include('Unknown symbol')
    end

    it 'requires symbol parameter' do
      post '/api/dashboard/add', params: {}
      expect(response).to have_http_status(:bad_request)
    end
  end

  describe 'POST /api/dashboard/remove' do
    it 'removes a symbol' do
      Utils::SymbolStore.save_dashboard_symbols(%w[BTCUSD ETHUSD])
      post '/api/dashboard/remove', params: { symbol: 'BTCUSD' }
      expect(response).to have_http_status(:ok)
      expect(response.parsed_body['symbols']).not_to include('BTCUSD')
    end
  end
end
