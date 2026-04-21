# frozen_string_literal: true

require 'rails_helper'

RSpec.describe Utils::FredClient do
  subject(:client) { described_class.new }

  before { allow(MacroConfig).to receive(:fred_api_key).and_return('test_key_123') }

  let(:observations) do
    [
      { 'date' => '2026-01-01', 'value' => '5.33' },
      { 'date' => '2026-02-01', 'value' => '5.33' },
      { 'date' => '2026-03-01', 'value' => '.' }
    ]
  end

  describe '#fetch_series' do
    context 'when API returns 200' do
      before do
        stub_request(:get, 'https://api.stlouisfed.org/fred/series/observations')
          .with(query: hash_including('api_key' => 'test_key_123'))
          .to_return(
            status: 200,
            body: { 'observations' => observations }.to_json,
            headers: { 'Content-Type' => 'application/json' }
          )
      end

      it 'returns parsed records' do
        result = client.fetch_series(series_id: 'FEDFUNDS')
        expect(result.size).to eq(2)
      end

      it 'skips observations with value "."' do
        result = client.fetch_series(series_id: 'FEDFUNDS')
        expect(result.map { |r| r[:value] }).to all(be_a(Float))
      end

      it 'parses dates as UTC timestamps' do
        result = client.fetch_series(series_id: 'FEDFUNDS')
        expect(result.first[:ts]).to eq(Time.utc(2026, 1, 1))
      end

      it 'passes observation_start when from is given' do
        from = Time.utc(2026, 2, 1)
        stub_request(:get, 'https://api.stlouisfed.org/fred/series/observations')
          .with(query: hash_including('observation_start' => '2026-02-01'))
          .to_return(status: 200, body: { 'observations' => [] }.to_json, headers: { 'Content-Type' => 'application/json' })

        client.fetch_series(series_id: 'FEDFUNDS', from:)
      end
    end

    context 'when api_key is blank' do
      before { allow(MacroConfig).to receive(:fred_api_key).and_return(nil) }

      it 'returns [] without making HTTP request' do
        allow(Rails.logger).to receive(:warn)
        expect(client.fetch_series(series_id: 'FEDFUNDS')).to eq([])
        expect(WebMock).not_to have_requested(:get, /stlouisfed/)
      end
    end

    context 'when API returns error status' do
      before do
        stub_request(:get, 'https://api.stlouisfed.org/fred/series/observations')
          .with(query: hash_including('api_key' => 'test_key_123'))
          .to_return(status: 400)
      end

      it 'returns empty array' do
        allow(Rails.logger).to receive(:warn)
        expect(client.fetch_series(series_id: 'FEDFUNDS')).to eq([])
      end

      it 'logs warning with series_id' do
        expect(Rails.logger).to receive(:warn).with(/FEDFUNDS/)
        client.fetch_series(series_id: 'FEDFUNDS')
      end
    end

    context 'when request times out' do
      before do
        stub_request(:get, 'https://api.stlouisfed.org/fred/series/observations')
          .with(query: hash_including('api_key' => 'test_key_123'))
          .to_timeout
      end

      it 'returns empty array and logs' do
        expect(Rails.logger).to receive(:warn).with(/FEDFUNDS/)
        expect(client.fetch_series(series_id: 'FEDFUNDS')).to eq([])
      end
    end
  end
end
