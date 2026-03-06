# frozen_string_literal: true

require 'rails_helper'

RSpec.describe Utils::BitfinexClient do
  subject(:client) { described_class.new }

  let(:base_url) { BitfinexConfig.api_url }

  describe '#tickers' do
    it 'returns parsed ticker data' do
      body = [ [ 'tBTCUSD', 50_000, 1, 50_001, 2, 100, 0.02, 50_000, 1000, 51_000, 49_000 ] ]
      stub_request(:get, "#{base_url}/tickers")
        .with(query: { symbols: 'tBTCUSD,tETHUSD' })
        .to_return(status: 200, body: body.to_json, headers: { 'Content-Type' => 'application/json' })

      result = client.tickers(%w[tBTCUSD tETHUSD])
      expect(result).to be_an(Array)
      expect(result.first.first).to eq('tBTCUSD')
    end

    it 'raises RateLimitError on 429' do
      stub_request(:get, "#{base_url}/tickers")
        .with(query: { symbols: 'tBTCUSD' })
        .to_return(status: 429, body: 'rate limit')

      expect { client.tickers(%w[tBTCUSD]) }.to raise_error(Utils::BitfinexClient::RateLimitError)
    end

    it 'raises ApiError on 500' do
      stub_request(:get, "#{base_url}/tickers")
        .with(query: { symbols: 'tBTCUSD' })
        .to_return(status: 500, body: 'error')

      expect { client.tickers(%w[tBTCUSD]) }.to raise_error(Utils::BitfinexClient::ApiError)
    end
  end

  describe '#candles_history' do
    it 'returns candle data' do
      candles = [ [ 1_700_000_000_000, 50_000, 50_100, 50_200, 49_900, 10 ] ]
      stub_request(:get, %r{#{base_url}/candles/trade:1m:tBTCUSD/hist})
        .to_return(status: 200, body: candles.to_json, headers: { 'Content-Type' => 'application/json' })

      result = client.candles_history(symbol: 'tBTCUSD', interval: '1m')
      expect(result).to be_an(Array)
      expect(result.first.length).to eq(6)
    end

    it 'passes query params' do
      stub = stub_request(:get, %r{#{base_url}/candles/trade:1m:tBTCUSD/hist})
        .with(query: hash_including(limit: '500', end: '1700000000000'))
        .to_return(status: 200, body: '[]', headers: { 'Content-Type' => 'application/json' })

      client.candles_history(symbol: 'tBTCUSD', interval: '1m', end_time: 1_700_000_000_000, limit: 500)
      expect(stub).to have_been_requested
    end
  end
end
