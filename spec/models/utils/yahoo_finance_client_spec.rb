# frozen_string_literal: true

require 'rails_helper'

RSpec.describe Utils::YahooFinanceClient do
  subject(:client) { described_class.new }

  let(:api_url) { MarketsConfig.api_url }

  let(:yahoo_response) do
    {
      'chart' => {
        'result' => [{
          'meta' => {
            'regularMarketPrice' => 5100.5,
            'chartPreviousClose' => 5050.0,
            'shortName' => 'S&P 500',
            'currency' => 'USD',
            'regularMarketTime' => 1_700_000_000
          }
        }]
      }
    }.to_json
  end

  before { Rails.cache.clear }

  describe '#fetch_quotes' do
    it 'returns empty hash for empty symbols' do
      expect(client.fetch_quotes([])).to eq({})
    end

    it 'returns quote metadata keyed by symbol' do
      stub_request(:get, %r{#{api_url}/\^GSPC})
        .to_return(status: 200, body: yahoo_response, headers: { 'Content-Type' => 'application/json' })

      result = client.fetch_quotes(['^GSPC'])
      expect(result).to have_key('^GSPC')
      expect(result['^GSPC']['regularMarketPrice']).to eq(5100.5)
    end

    it 'handles HTTP errors gracefully' do
      stub_request(:get, %r{#{api_url}/INVALID})
        .to_return(status: 404, body: 'Not Found')

      result = client.fetch_quotes(['INVALID'])
      expect(result).to eq({})
    end

    it 'caches results' do
      stub = stub_request(:get, %r{#{api_url}/\^GSPC})
        .to_return(status: 200, body: yahoo_response, headers: { 'Content-Type' => 'application/json' })

      allow(Rails).to receive(:cache).and_return(ActiveSupport::Cache::MemoryStore.new)
      client.fetch_quotes(['^GSPC'])
      client.fetch_quotes(['^GSPC'])
      expect(stub).to have_been_requested.once
    end
  end
end
