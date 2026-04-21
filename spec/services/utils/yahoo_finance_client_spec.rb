# frozen_string_literal: true

require 'rails_helper'

RSpec.describe Utils::YahooFinanceClient do
  subject(:client) { described_class.new }

  let(:api_url) { MarketsConfig.api_url }

  let(:yahoo_response) do
    {
      'chart' => {
        'result' => [ {
          'meta' => {
            'regularMarketPrice' => 5100.5,
            'chartPreviousClose' => 5050.0,
            'shortName' => 'S&P 500',
            'currency' => 'USD',
            'regularMarketTime' => 1_700_000_000
          }
        } ]
      }
    }.to_json
  end

  before { Rails.cache.clear }

  let(:ticker) { 'DX-Y.NYB' }

  let(:history_response) do
    {
      'chart' => {
        'result' => [ {
          'timestamp' => [ 1735689600, 1735776000, 1735862400 ],
          'indicators' => { 'quote' => [ { 'close' => [ 108.5, nil, 107.8 ] } ] }
        } ]
      }
    }.to_json
  end

  describe '#fetch_history' do
    context 'without from (range: max)' do
      before do
        stub_request(:get, "#{api_url}/#{CGI.escape(ticker)}")
          .with(query: hash_including('range' => 'max', 'interval' => '1d'))
          .to_return(status: 200, body: history_response, headers: { 'Content-Type' => 'application/json' })
      end

      it 'returns records with UTC ts and Float value' do
        result = client.fetch_history(ticker:)
        expect(result.size).to eq(2)
        expect(result.first[:ts]).to be_a(Time).and(satisfy(&:utc?))
        expect(result.first[:value]).to be_a(Float)
      end

      it 'skips nil closes' do
        result = client.fetch_history(ticker:)
        expect(result.map { |r| r[:value] }).to all(be_a(Float))
      end
    end

    context 'with from (period1/period2)' do
      let(:from) { Time.utc(2026, 1, 1) }

      before do
        stub_request(:get, "#{api_url}/#{CGI.escape(ticker)}")
          .with(query: hash_including('period1' => from.to_i.to_s, 'interval' => '1d'))
          .to_return(status: 200, body: history_response, headers: { 'Content-Type' => 'application/json' })
      end

      it 'uses period1/period2 params instead of range' do
        result = client.fetch_history(ticker:, from:)
        expect(result).not_to be_empty
      end
    end

    context 'when API returns non-200' do
      before do
        stub_request(:get, "#{api_url}/#{CGI.escape(ticker)}")
          .with(query: hash_including('interval' => '1d'))
          .to_return(status: 404)
      end

      it 'returns []' do
        allow(Rails.logger).to receive(:warn)
        expect(client.fetch_history(ticker:)).to eq([])
      end
    end

    context 'when request times out' do
      before do
        stub_request(:get, "#{api_url}/#{CGI.escape(ticker)}")
          .with(query: hash_including('interval' => '1d'))
          .to_timeout
      end

      it 'returns [] and logs warning' do
        expect(Rails.logger).to receive(:warn).with(/fetch_history/)
        expect(client.fetch_history(ticker:)).to eq([])
      end
    end

    context 'when chart result is missing' do
      before do
        stub_request(:get, "#{api_url}/#{CGI.escape(ticker)}")
          .with(query: hash_including('interval' => '1d'))
          .to_return(status: 200, body: { 'chart' => { 'result' => nil } }.to_json,
                     headers: { 'Content-Type' => 'application/json' })
      end

      it 'returns []' do
        expect(client.fetch_history(ticker:)).to eq([])
      end
    end
  end

  describe '#fetch_quotes' do
    it 'returns empty hash for empty symbols' do
      expect(client.fetch_quotes([])).to eq({})
    end

    it 'returns quote metadata keyed by symbol' do
      stub_request(:get, %r{#{api_url}/\^GSPC})
        .to_return(status: 200, body: yahoo_response, headers: { 'Content-Type' => 'application/json' })

      result = client.fetch_quotes([ '^GSPC' ])
      expect(result).to have_key('^GSPC')
      expect(result['^GSPC']['regularMarketPrice']).to eq(5100.5)
    end

    it 'handles HTTP errors gracefully' do
      stub_request(:get, %r{#{api_url}/INVALID})
        .to_return(status: 404, body: 'Not Found')

      result = client.fetch_quotes([ 'INVALID' ])
      expect(result).to eq({})
    end

    it 'caches results' do
      stub = stub_request(:get, %r{#{api_url}/\^GSPC})
        .to_return(status: 200, body: yahoo_response, headers: { 'Content-Type' => 'application/json' })

      allow(Rails).to receive(:cache).and_return(ActiveSupport::Cache::MemoryStore.new)
      client.fetch_quotes([ '^GSPC' ])
      client.fetch_quotes([ '^GSPC' ])
      expect(stub).to have_been_requested.once
    end
  end
end
