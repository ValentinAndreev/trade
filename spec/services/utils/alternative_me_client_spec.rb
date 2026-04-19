# frozen_string_literal: true

require 'rails_helper'

RSpec.describe Utils::AlternativeMeClient do
  subject(:client) { described_class.new }

  let(:response_body) do
    {
      'data' => [
        { 'timestamp' => '1704067200', 'value' => '75', 'value_classification' => 'Greed' },
        { 'timestamp' => '1703980800', 'value' => '60', 'value_classification' => 'Greed' },
        { 'timestamp' => '1703894400', 'value' => nil, 'value_classification' => 'Neutral' }
      ]
    }.to_json
  end

  describe '#fetch_history' do
    context 'when API returns 200' do
      before do
        stub_request(:get, 'https://api.alternative.me/fng/')
          .to_return(status: 200, body: response_body, headers: { 'Content-Type' => 'application/json' })
      end

      it 'returns parsed records' do
        result = client.fetch_history
        expect(result.size).to eq(2)
      end

      it 'skips entries with nil value' do
        result = client.fetch_history
        expect(result.map { |r| r[:value] }).to all(be_a(Float))
      end

      it 'returns UTC Time for ts' do
        result = client.fetch_history
        expect(result.first[:ts]).to be_a(Time)
        expect(result.first[:ts].utc?).to be true
      end

      it 'passes limit param to API' do
        stub_request(:get, 'https://api.alternative.me/fng/')
          .with(query: hash_including('limit' => '5'))
          .to_return(status: 200, body: { 'data' => [] }.to_json, headers: { 'Content-Type' => 'application/json' })

        client.fetch_history(limit: 5)
      end
    end

    context 'when API returns non-200' do
      before do
        stub_request(:get, 'https://api.alternative.me/fng/').to_return(status: 429)
      end

      it 'returns empty array' do
        allow(Rails.logger).to receive(:warn)
        expect(client.fetch_history).to eq([])
      end

      it 'logs warning with status code' do
        expect(Rails.logger).to receive(:warn).with(/HTTP 429/)
        client.fetch_history
      end
    end

    context 'when request times out' do
      before do
        stub_request(:get, 'https://api.alternative.me/fng/').to_timeout
      end

      it 'returns empty array' do
        allow(Rails.logger).to receive(:warn)
        expect(client.fetch_history).to eq([])
      end

      it 'logs the error' do
        expect(Rails.logger).to receive(:warn).with(/fetch_history failed/)
        client.fetch_history
      end
    end
  end
end
