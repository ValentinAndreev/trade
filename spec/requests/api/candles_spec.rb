# frozen_string_literal: true

require 'rails_helper'

RSpec.describe 'Api::Candles' do
  describe 'GET /api/candles' do
    before do
      Rails.cache.clear
      5.times do |i|
        create(:candle, symbol: 'BTCUSD', timeframe: '1m',
               ts: Time.utc(2026, 1, 1, 12, 0) + i.minutes,
               open: 50_000, high: 50_100, low: 49_900, close: 50_050, volume: 10)
      end
    end

    it 'returns candle data' do
      get '/api/candles', params: {
        symbol: 'BTCUSD', timeframe: '1m',
        start_time: Time.utc(2026, 1, 1, 12, 0).iso8601,
        end_time: Time.utc(2026, 1, 1, 12, 4).iso8601
      }
      expect(response).to have_http_status(:ok)

      json = response.parsed_body
      expect(json).to be_an(Array)
      expect(json.length).to eq(5)
    end

    it 'requires symbol parameter' do
      get '/api/candles', params: { timeframe: '1m' }
      expect(response).to have_http_status(:bad_request)
    end

    it 'returns empty array for unknown symbol' do
      get '/api/candles', params: { symbol: 'NONEXIST', timeframe: '1m' }
      expect(response).to have_http_status(:ok)
      expect(response.parsed_body).to eq([])
    end
  end
end
