# frozen_string_literal: true

require 'rails_helper'

RSpec.describe 'Api::Configs' do
  let!(:user) { create(:user, password: 'password123') }

  describe 'GET /api/configs' do
    before { sign_in(user) }

    it 'returns symbols and timeframes' do
      get '/api/configs'
      expect(response).to have_http_status(:ok)

      json = response.parsed_body
      expect(json['symbols']).to eq(BitfinexConfig.available_symbols)
      expect(json['timeframes']).to eq(BitfinexConfig.timeframes)
    end
  end
end
