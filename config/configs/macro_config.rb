# frozen_string_literal: true

class MacroConfig < ApplicationConfig
  attr_config :fred_api_key

  INDICATORS = {
    dxy: {
      source: 'yahoo',
      ticker: 'DX-Y.NYB',
      label: 'DXY (Dollar Index)',
      category: 'macro',
      frequency: :hourly
    },
    vix: {
      source: 'yahoo',
      ticker: '^VIX',
      label: 'VIX',
      category: 'macro',
      frequency: :hourly
    },
    fear_greed: {
      source: 'alternative_me',
      label: 'Crypto Fear & Greed',
      category: 'macro',
      frequency: :daily
    },
    fed_rate: {
      source: 'fred',
      series_id: 'FEDFUNDS',
      label: 'Fed Funds Rate',
      category: 'macro',
      frequency: :daily
    },
    m2: {
      source: 'fred',
      series_id: 'M2SL',
      label: 'M2 Money Supply',
      category: 'macro',
      frequency: :daily
    },
    cpi: {
      source: 'fred',
      series_id: 'CPIAUCSL',
      label: 'CPI (Inflation)',
      category: 'macro',
      frequency: :daily
    },
    mvrv_ratio: {
      source: 'coin_metrics',
      asset: 'btc',
      metric: 'CapMVRVCur',
      label: 'BTC MVRV Ratio',
      category: 'onchain',
      frequency: :daily
    },
    mvrv_z_score: {
      source: 'coin_metrics',
      asset: 'btc',
      formula: 'mvrv_z_score',
      label: 'BTC MVRV Z-Score',
      category: 'onchain',
      frequency: :daily
    },
    nupl: {
      source: 'coin_metrics',
      asset: 'btc',
      formula: 'nupl',
      label: 'BTC NUPL',
      category: 'onchain',
      frequency: :daily
    },
    realized_price: {
      source: 'coin_metrics',
      asset: 'btc',
      formula: 'realized_price',
      label: 'BTC Realized Price',
      category: 'onchain',
      frequency: :daily
    }
  }.freeze

  INDICATOR_KEYS = INDICATORS.keys.map(&:to_s).freeze

  def self.all_indicators = INDICATORS
  def self.indicator_keys = INDICATOR_KEYS
end
