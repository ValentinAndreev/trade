# frozen_string_literal: true

require 'rails_helper'

RSpec.describe Utils::SymbolStore, :symbol_store do
  describe 'dashboard symbols' do
    it 'reads symbols from dashboard config' do
      expect(described_class.dashboard_symbols).to eq(BitfinexConfig.default_symbols)
    end

    it 'saves and reads symbols' do
      described_class.save_dashboard_symbols(%w[ETHUSD BTCUSD])
      expect(described_class.dashboard_symbols).to eq(%w[ETHUSD BTCUSD])
    end

    it 'preserves dashboard symbol order' do
      described_class.save_dashboard_symbols(%w[XRPUSD ADAUSD BTCUSD])
      expect(described_class.dashboard_symbols).to eq(%w[XRPUSD ADAUSD BTCUSD])
    end

    it 'adds a symbol' do
      described_class.save_dashboard_symbols(%w[BTCUSD])
      described_class.add_dashboard_symbol('ETHUSD')
      expect(described_class.dashboard_symbols).to include('ETHUSD')
    end

    it 'does not duplicate symbols' do
      described_class.save_dashboard_symbols(%w[BTCUSD])
      result = described_class.add_dashboard_symbol('BTCUSD')
      expect(result.count('BTCUSD')).to eq(1)
    end

    it 'removes a symbol' do
      described_class.save_dashboard_symbols(%w[BTCUSD ETHUSD])
      described_class.remove_dashboard_symbol('BTCUSD')
      expect(described_class.dashboard_symbols).to eq(%w[ETHUSD])
    end
  end

  describe 'market symbols' do
    it 'reads symbols from markets config' do
      expect(described_class.market_symbols).to eq(MarketsConfig.default_symbols)
    end

    it 'saves and reads market symbols' do
      data = { 'forex' => %w[EURUSD=X], 'indices' => %w[^GSPC] }
      described_class.save_market_symbols(data)
      result = described_class.market_symbols
      expect(result['forex']).to eq(%w[EURUSD=X])
      expect(result['indices']).to eq(%w[^GSPC])
    end

    it 'preserves market symbol order' do
      data = { 'indices' => %w[^DJI ^GSPC], 'forex' => %w[USDJPY=X EURUSD=X] }
      described_class.save_market_symbols(data)
      result = described_class.market_symbols
      expect(result.keys).to eq(%w[indices forex])
      expect(result['forex']).to eq(%w[USDJPY=X EURUSD=X])
    end

    it 'adds a market symbol' do
      described_class.save_market_symbols('forex' => %w[EURUSD=X])
      described_class.add_market_symbol('forex', 'GBPUSD=X')
      expect(described_class.market_symbols['forex']).to include('GBPUSD=X')
    end

    it 'removes a market symbol' do
      described_class.save_market_symbols('forex' => %w[EURUSD=X GBPUSD=X])
      described_class.remove_market_symbol('forex', 'EURUSD=X')
      expect(described_class.market_symbols['forex']).to eq(%w[GBPUSD=X])
    end
  end

  describe 'preset helpers' do
    it '#snapshot returns current symbols seeded from defaults' do
      snap = described_class.snapshot
      expect(snap[:dashboardSymbols]).to eq(BitfinexConfig.default_symbols)
      expect(snap[:marketsSymbols]).to eq(MarketsConfig.default_symbols)
    end

    it '#snapshot captures current state' do
      described_class.save_dashboard_symbols(%w[BTCUSD])
      snap = described_class.snapshot
      expect(snap[:dashboardSymbols]).to eq(%w[BTCUSD])
    end

    it '#reset! drops current state and restores defaults on next read' do
      described_class.save_dashboard_symbols(%w[BTCUSD])
      described_class.save_market_symbols('forex' => %w[EURUSD=X])
      described_class.reset!
      expect(described_class.dashboard_symbols).to eq(BitfinexConfig.default_symbols)
      expect(described_class.market_symbols).to eq(MarketsConfig.default_symbols)
      expect(described_class.current_path).to exist
    end

    it '#restore! writes both files' do
      described_class.restore!(
        dashboard_symbols: %w[ETHUSD],
        market_symbols: { 'forex' => %w[EURUSD=X] }
      )
      expect(described_class.dashboard_symbols).to eq(%w[ETHUSD])
      expect(described_class.market_symbols['forex']).to eq(%w[EURUSD=X])
    end
  end
end
