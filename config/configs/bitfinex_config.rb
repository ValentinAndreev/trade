class BitfinexConfig < ApplicationConfig
  attr_config :api_url,
    timeframes: %w[1m 5m 15m 1h 4h 1d],
    rate_limit_pause: 3,
    sync_pause: 1,
    batch_size: 5000,
    default_interval: '1m'

  def api_url = super || 'https://api-pub.bitfinex.com/v2'

  def symbols = DashboardConfig.current_dashboard_symbols

  def available_symbols = DashboardConfig.dashboard_all_symbols

  def default_symbols = DashboardConfig.dashboard_default_symbols
end
