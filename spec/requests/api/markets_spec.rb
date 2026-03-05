# frozen_string_literal: true

require 'rails_helper'

RSpec.describe 'Api::Markets', :symbol_store do
  let(:yahoo_client) { instance_double(Utils::YahooFinanceClient) }

  before do
    allow(Utils::YahooFinanceClient).to receive(:new).and_return(yahoo_client)
  end

  describe 'GET /api/markets' do
    it 'returns market data grouped by category' do
      allow(yahoo_client).to receive(:fetch_quotes).and_return(
        '^GSPC' => {
          'regularMarketPrice' => 5100.5,
          'chartPreviousClose' => 5050.0,
          'shortName' => 'S&P 500',
          'currency' => 'USD',
          'regularMarketTime' => 1_700_000_000
        }
      )

      Utils::SymbolStore.save_market_symbols('indices' => %w[^GSPC])

      get '/api/markets'
      expect(response).to have_http_status(:ok)

      json = response.parsed_body
      expect(json['indices']).to be_an(Array)
      expect(json['available']).to be_present
      expect(json['labels']).to be_present
    end
  end

  describe 'POST /api/markets/add' do
    it 'adds a valid symbol to a valid category' do
      available = MarketsConfig.available
      category = available.keys.first.to_s
      symbol = Array(available.values.first).first

      post '/api/markets/add', params: { category: category, symbol: symbol }
      expect(response).to have_http_status(:ok)
      expect(response.parsed_body['symbols']).to be_present
    end

    it 'rejects invalid category' do
      post '/api/markets/add', params: { category: 'invalid', symbol: '^GSPC' }
      expect(response).to have_http_status(:bad_request)
      expect(response.parsed_body['error']).to include('Invalid category')
    end

    it 'rejects unknown symbol for valid category' do
      post '/api/markets/add', params: { category: 'indices', symbol: 'FAKE' }
      expect(response).to have_http_status(:bad_request)
      expect(response.parsed_body['error']).to include('Unknown symbol')
    end
  end

  describe 'POST /api/markets/remove' do
    it 'removes a symbol' do
      Utils::SymbolStore.save_market_symbols('indices' => %w[^GSPC ^DJI])
      post '/api/markets/remove', params: { category: 'indices', symbol: '^GSPC' }
      expect(response).to have_http_status(:ok)
    end
  end
end
