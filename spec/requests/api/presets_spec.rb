# frozen_string_literal: true

require 'rails_helper'

RSpec.describe 'Api::Presets', :symbol_store do
  let!(:user) { create(:user, password: 'password123') }

  before { sign_in(user) }

  describe 'GET /api/presets' do
    it 'lists user presets' do
      create(:preset, user: user, name: 'Setup A')
      create(:preset, user: user, name: 'Setup B')

      get '/api/presets'
      expect(response).to have_http_status(:ok)

      json = response.parsed_body
      expect(json.length).to eq(2)
      expect(json.map { |p| p['name'] }).to contain_exactly('Setup A', 'Setup B')
    end

    it 'returns 401 when not authenticated' do
      delete '/api/session'
      get '/api/presets'
      expect(response).to have_http_status(:unauthorized)
    end
  end

  describe 'POST /api/presets' do
    it 'creates a new preset' do
      expect {
        post '/api/presets', params: { name: 'My Setup', payload: { tabs: [] } }
      }.to change(Preset, :count).by(1)

      expect(response).to have_http_status(:created)
      expect(response.parsed_body['name']).to eq('My Setup')
    end

    it 'updates existing preset with same name' do
      create(:preset, user: user, name: 'My Setup', payload: { tabs: [] })

      expect {
        post '/api/presets', params: { name: 'My Setup', payload: { tabs: [ 1 ] } }
      }.not_to change(Preset, :count)

      expect(response).to have_http_status(:ok)
    end

    it 'rejects blank name' do
      post '/api/presets', params: { name: '', payload: { tabs: [] } }
      expect(response).to have_http_status(:unprocessable_entity)
    end
  end

  describe 'GET /api/presets/:id' do
    it 'returns preset with payload' do
      preset = create(:preset, user: user, payload: { tabs: [ 1, 2 ] })
      get "/api/presets/#{preset.id}"
      expect(response).to have_http_status(:ok)
      expect(response.parsed_body['payload']).to eq({ 'tabs' => [ 1, 2 ] })
    end

    it 'returns 404 for another user preset' do
      other = create(:user)
      preset = create(:preset, user: other)
      get "/api/presets/#{preset.id}"
      expect(response).to have_http_status(:not_found)
    end
  end

  describe 'PATCH /api/presets/:id' do
    it 'updates preset attributes' do
      preset = create(:preset, user: user, name: 'Old Name')
      patch "/api/presets/#{preset.id}", params: { name: 'New Name' }
      expect(response).to have_http_status(:ok)
      expect(preset.reload.name).to eq('New Name')
    end
  end

  describe 'DELETE /api/presets/:id' do
    it 'deletes preset' do
      preset = create(:preset, user: user)
      expect { delete "/api/presets/#{preset.id}" }.to change(Preset, :count).by(-1)
      expect(response).to have_http_status(:ok)
    end
  end

  describe 'GET /api/presets/state' do
    it 'returns symbol store snapshot' do
      get '/api/presets/state'
      expect(response).to have_http_status(:ok)
      expect(response.parsed_body).to include('dashboardSymbols', 'marketsSymbols')
    end
  end

  describe 'POST /api/presets/reset_state' do
    it 'resets symbol store' do
      Utils::SymbolStore.save_dashboard_symbols(%w[BTCUSD])
      Utils::SymbolStore.save_market_symbols('forex' => %w[EURUSD=X])
      post '/api/presets/reset_state'
      expect(response).to have_http_status(:ok)
      expect(Utils::SymbolStore.dashboard_symbols).to eq(BitfinexConfig.default_symbols)
      expect(Utils::SymbolStore.market_symbols).to eq(MarketsConfig.default_symbols)
    end
  end

  describe 'POST /api/presets/apply_state' do
    it 'applies symbol state' do
      post '/api/presets/apply_state', params: {
        dashboardSymbols: %w[ETHUSD],
        marketsSymbols: { forex: %w[EURUSD=X] }
      }
      expect(response).to have_http_status(:ok)
      expect(Utils::SymbolStore.dashboard_symbols).to eq(%w[ETHUSD])
    end
  end
end
