# frozen_string_literal: true

require 'rails_helper'

RSpec.describe 'Api::Indicators' do
  describe 'GET /api/indicators' do
    it 'returns available indicators' do
      get '/api/indicators'
      expect(response).to have_http_status(:ok)

      json = response.parsed_body
      expect(json).to be_an(Array)
      keys = json.map { |i| i['key'] }
      expect(keys).to include('sma', 'ema', 'rsi')
    end
  end

  describe 'POST /api/indicators/:type/compute' do
    before do
      Rails.cache.clear
      50.times do |i|
        create(:candle, symbol: 'BTCUSD', timeframe: '1m',
               ts: Time.utc(2026, 1, 1, 12, 0) + i.minutes,
               open: 50_000 + i, high: 50_100 + i, low: 49_900 + i,
               close: 50_050 + i, volume: 10 + i)
      end
    end

    it 'computes SMA indicator' do
      post '/api/indicators/sma/compute', params: {
        symbol: 'BTCUSD', timeframe: '1m', period: 14,
        start_time: Time.utc(2026, 1, 1, 12, 0).iso8601
      }
      expect(response).to have_http_status(:ok)

      json = response.parsed_body
      expect(json).to be_an(Array)
      expect(json).not_to be_empty
    end

    it 'returns 400 for unknown indicator type' do
      post '/api/indicators/nonexistent/compute', params: {
        symbol: 'BTCUSD', timeframe: '1m'
      }
      expect(response).to have_http_status(:bad_request)
      expect(response.parsed_body['error']).to include('Unknown indicator')
    end

    it 'requires symbol and timeframe' do
      post '/api/indicators/sma/compute', params: {}
      expect(response).to have_http_status(:bad_request)
    end
  end
end
