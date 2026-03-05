# frozen_string_literal: true

require 'rails_helper'

RSpec.describe 'Api::Tickers', :symbol_store do
  describe 'GET /api/tickers' do
    it 'returns ticker data for dashboard symbols' do
      now = Time.utc(2026, 3, 1, 12, 0)
      create(:candle, symbol: 'BTCUSD', ts: now, close: 50_000)
      Utils::SymbolStore.save_dashboard_symbols(%w[BTCUSD])

      get '/api/tickers'
      expect(response).to have_http_status(:ok)

      json = response.parsed_body
      expect(json).to be_an(Array)
      expect(json.first['symbol']).to eq('BTCUSD')
    end

    it 'returns empty array when no candle data' do
      Utils::SymbolStore.save_dashboard_symbols(%w[BTCUSD])
      get '/api/tickers'
      expect(response).to have_http_status(:ok)
      expect(response.parsed_body).to eq([])
    end
  end
end
