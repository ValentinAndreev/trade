# frozen_string_literal: true

require 'rails_helper'

RSpec.describe Candle::Sync::HistorySource do
  let(:client) { instance_double(Utils::BitfinexClient) }
  let(:source) { described_class.new(symbol: 'BTCUSD', interval: '1m', client: client) }

  before do
    allow(Rails.logger).to receive(:warn)
  end

  describe '#fetch_records' do
    it 'maps Bitfinex candle history rows into candle records' do
      now = Time.utc(2026, 1, 1, 12, 0)
      allow(client).to receive(:candles_history).with(
        symbol: 'tBTCUSD',
        interval: '1m',
        end_time: 123_456,
        limit: Candle::Fetcher::MAX_LIMIT
      ).and_return([
        [ now.to_i * 1000, 50_000, 50_100, 50_200, 49_900, 10 ]
      ])

      expect(source.fetch_records(end_time: 123_456)).to eq([
        {
          ts: Time.zone.at(now.to_i),
          symbol: 'BTCUSD',
          exchange: 'bitfinex',
          timeframe: '1m',
          open: 50_000,
          close: 50_100,
          high: 50_200,
          low: 49_900,
          volume: 10
        }
      ])
    end

    it 'retries on rate limit errors' do
      now = Time.utc(2026, 1, 1, 12, 0)
      attempts = 0

      allow(source).to receive(:sleep)
      allow(client).to receive(:candles_history) do
        attempts += 1
        raise Utils::BitfinexClient::RateLimitError, 'rate limit' if attempts == 1

        [ [ now.to_i * 1000, 50_000, 50_100, 50_200, 49_900, 10 ] ]
      end

      records = source.fetch_records(end_time: 123_456, limit: 10)

      expect(attempts).to eq(2)
      expect(records.length).to eq(1)
    end

    it 'raises FetchError after max retry attempts' do
      allow(source).to receive(:sleep)
      allow(client).to receive(:candles_history).and_raise(Utils::BitfinexClient::RateLimitError, 'rate limit')

      expect {
        source.fetch_records(end_time: 123_456, limit: 10)
      }.to raise_error(Candle::Fetcher::FetchError, /after 5 attempts/)
    end
  end
end
