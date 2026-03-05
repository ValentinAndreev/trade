# frozen_string_literal: true

require 'rails_helper'

RSpec.describe 'Api::Configs' do
  describe 'GET /api/configs' do
    it 'returns symbols and timeframes' do
      get '/api/configs'
      expect(response).to have_http_status(:ok)

      json = response.parsed_body
      expect(json['symbols']).to eq(BitfinexConfig.symbols)
      expect(json['timeframes']).to eq(BitfinexConfig.timeframes)
    end
  end
end
