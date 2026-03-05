# frozen_string_literal: true

require 'rails_helper'

RSpec.describe Utils::SymbolStore, :symbol_store do
  describe 'dashboard symbols' do
    it 'returns defaults when no file exists' do
      expect(described_class.dashboard_symbols).to eq(BitfinexConfig.symbols)
    end

    it 'saves and reads symbols' do
      described_class.save_dashboard_symbols(%w[ETHUSD BTCUSD])
      expect(described_class.dashboard_symbols).to eq(%w[BTCUSD ETHUSD])
    end

    it 'stores symbols in sorted order' do
      described_class.save_dashboard_symbols(%w[XRPUSD ADAUSD BTCUSD])
      expect(described_class.dashboard_symbols).to eq(%w[ADAUSD BTCUSD XRPUSD])
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
    it 'returns defaults when no file exists' do
      defaults = MarketsConfig.symbols.transform_keys(&:to_s).transform_values { |v| Array(v) }
      expect(described_class.market_symbols).to eq(defaults)
    end

    it 'saves and reads market symbols' do
      data = { 'forex' => %w[EURUSD=X], 'indices' => %w[^GSPC] }
      described_class.save_market_symbols(data)
      result = described_class.market_symbols
      expect(result['forex']).to eq(%w[EURUSD=X])
      expect(result['indices']).to eq(%w[^GSPC])
    end

    it 'sorts categories and symbols' do
      data = { 'indices' => %w[^DJI ^GSPC], 'forex' => %w[USDJPY=X EURUSD=X] }
      described_class.save_market_symbols(data)
      result = described_class.market_symbols
      expect(result.keys).to eq(%w[forex indices])
      expect(result['forex']).to eq(%w[EURUSD=X USDJPY=X])
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
    it '#snapshot returns nil when no files exist' do
      snap = described_class.snapshot
      expect(snap[:dashboardSymbols]).to be_nil
      expect(snap[:marketsSymbols]).to be_nil
    end

    it '#snapshot captures current state' do
      described_class.save_dashboard_symbols(%w[BTCUSD])
      snap = described_class.snapshot
      expect(snap[:dashboardSymbols]).to eq(%w[BTCUSD])
    end

    it '#reset! removes files' do
      described_class.save_dashboard_symbols(%w[BTCUSD])
      described_class.save_market_symbols('forex' => %w[EURUSD=X])
      described_class.reset!
      expect(described_class.dashboard_symbols).to eq(BitfinexConfig.symbols)
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
