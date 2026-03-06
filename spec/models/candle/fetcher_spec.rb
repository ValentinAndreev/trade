# frozen_string_literal: true

require 'rails_helper'

RSpec.describe Candle::Fetcher do
  let(:client) { instance_double(Utils::BitfinexClient) }

  before do
    allow(Utils::BitfinexClient).to receive(:new).and_return(client)
    Rails.cache.clear
  end

  describe '#call' do
    it 'fetches and imports candles' do
      now = Time.zone.now
      candle_data = [
        [ (now - 2.minutes).to_i * 1000, 50_000, 50_100, 50_200, 49_900, 10 ],
        [ (now - 1.minute).to_i * 1000, 50_100, 50_200, 50_300, 50_000, 15 ]
      ]

      allow(client).to receive(:candles_history).and_return(candle_data, [])
      allow(ActionCable.server).to receive(:broadcast)

      fetcher = described_class.new('BTCUSD')
      expect { fetcher.call }.to change(Candle, :count).by(2)
    end

    it 'broadcasts new candles via ActionCable' do
      now = Time.zone.now
      candle_data = [
        [ (now - 1.minute).to_i * 1000, 50_000, 50_100, 50_200, 49_900, 10 ]
      ]

      allow(client).to receive(:candles_history).and_return(candle_data, [])
      expect(ActionCable.server).to receive(:broadcast).with('candles:BTCUSD:1m', anything)

      described_class.new('BTCUSD').call
    end

    it 'stops when no data returned' do
      allow(client).to receive(:candles_history).and_return([])

      described_class.new('BTCUSD').call
      expect(Candle.count).to eq(0)
    end

    it 'retries on rate limit errors' do
      now = Time.zone.now
      candle_data = [ [ (now - 1.minute).to_i * 1000, 50_000, 50_100, 50_200, 49_900, 10 ] ]

      call_count = 0
      allow(client).to receive(:candles_history) do
        call_count += 1
        raise Utils::BitfinexClient::RateLimitError, 'rate limit' if call_count == 1

        call_count == 2 ? candle_data : []
      end
      allow(ActionCable.server).to receive(:broadcast)

      described_class.new('BTCUSD').call
      expect(Candle.count).to eq(1)
    end

    it 'raises FetchError after max retries' do
      allow(client).to receive(:candles_history)
        .and_raise(Utils::BitfinexClient::RateLimitError, 'rate limit')

      expect { described_class.new('BTCUSD').call }
        .to raise_error(Candle::Fetcher::FetchError, /after 5 attempts/)
    end
  end
end
