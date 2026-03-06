# frozen_string_literal: true

require 'rails_helper'

RSpec.describe 'Api::Tickers', :symbol_store do
  let(:bitfinex_ticker_response) do
    [
      [ 'tBTCUSD', 0, 0, 0, 0, 500.0, 0.01, 50_000.0, 1000.0, 51_000.0, 49_000.0 ]
    ]
  end

  before do
    stub_request(:get, %r{api-pub\.bitfinex\.com/v2/tickers})
      .to_return(status: 200, body: bitfinex_ticker_response.to_json, headers: { 'Content-Type' => 'application/json' })
    Rails.cache.clear
  end

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

    it 'returns empty array when no candle data and live tickers unavailable' do
      stub_request(:get, %r{api-pub\.bitfinex\.com/v2/tickers})
        .to_return(status: 500, body: 'error')

      Utils::SymbolStore.save_dashboard_symbols(%w[BTCUSD])
      get '/api/tickers'
      expect(response).to have_http_status(:ok)
      expect(response.parsed_body).to eq([])
    end
  end
end
