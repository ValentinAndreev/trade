# frozen_string_literal: true

require 'rails_helper'

RSpec.describe 'Api::MacroSeries' do
  let!(:user) { create(:user, password: 'password123') }

  describe 'GET /api/macro_series' do
    it 'requires authentication' do
      get '/api/macro_series', params: { indicators: %w[dxy] }
      expect(response).to have_http_status(:unauthorized)
    end

    context 'when authenticated' do
      before { sign_in(user) }

      context 'with valid indicators' do
        before do
          create(:macro_series, indicator: 'dxy', source: 'yahoo',
                 ts: Time.utc(2026, 1, 1), value: 101.5)
          create(:macro_series, indicator: 'vix', source: 'yahoo',
                 ts: Time.utc(2026, 1, 1), value: 18.3)
        end

        it 'returns data for requested indicator' do
          get '/api/macro_series', params: { indicators: %w[dxy] }

          expect(response).to have_http_status(:ok)
          body = response.parsed_body
          expect(body).to have_key('dxy')
          expect(body['dxy'].first[1]).to eq(101.5)
        end

        it 'returns multiple indicators' do
          get '/api/macro_series', params: { indicators: %w[dxy vix] }

          expect(response).to have_http_status(:ok)
          expect(response.parsed_body.keys).to match_array(%w[dxy vix])
        end
      end

      it 'returns 400 when all indicators are unknown' do
        get '/api/macro_series', params: { indicators: %w[fake unknown] }
        expect(response).to have_http_status(:bad_request)
      end

      it 'drops unknown indicators and returns valid ones' do
        create(:macro_series, indicator: 'dxy', source: 'yahoo',
               ts: Time.utc(2026, 1, 1), value: 100.0)

        get '/api/macro_series', params: { indicators: %w[dxy fake_indicator] }

        expect(response).to have_http_status(:ok)
        expect(response.parsed_body.keys).to eq(%w[dxy])
      end

      it 'returns 400 when indicators param is missing' do
        get '/api/macro_series'
        expect(response).to have_http_status(:bad_request)
      end
    end
  end
end
