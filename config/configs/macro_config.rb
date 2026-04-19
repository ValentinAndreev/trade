# frozen_string_literal: true

class MacroConfig < ApplicationConfig
  attr_config :fred_api_key

  INDICATORS = {
    dxy: {
      source: 'yahoo',
      ticker: 'DX-Y.NYB',
      label: 'DXY (Dollar Index)',
      frequency: :hourly
    },
    vix: {
      source: 'yahoo',
      ticker: '^VIX',
      label: 'VIX',
      frequency: :hourly
    },
    fear_greed: {
      source: 'alternative_me',
      label: 'Crypto Fear & Greed',
      frequency: :daily
    },
    fed_rate: {
      source: 'fred',
      series_id: 'FEDFUNDS',
      label: 'Fed Funds Rate',
      frequency: :daily
    },
    m2: {
      source: 'fred',
      series_id: 'M2SL',
      label: 'M2 Money Supply',
      frequency: :daily
    },
    cpi: {
      source: 'fred',
      series_id: 'CPIAUCSL',
      label: 'CPI (Inflation)',
      frequency: :daily
    }
  }.freeze

  INDICATOR_KEYS = INDICATORS.keys.map(&:to_s).freeze

  def self.all_indicators = INDICATORS
  def self.indicator_keys = INDICATOR_KEYS
end
