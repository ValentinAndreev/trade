class BitfinexConfig < ApplicationConfig
  attr_config :api_url,
    symbols: %w[BTCUSD ETHUSD XRPUSD SOLUSD XMRUSD ADAUSD DOTUSD LTCUSD LINK:USD AVAX:USD DOGE:USD],
    timeframes: %w[1m 5m 15m 1h 4h 1d],
    rate_limit_pause: 3,
    sync_pause: 1,
    batch_size: 5000,
    default_interval: '1m'

  def api_url
    super || 'https://api-pub.bitfinex.com/v2'
  end
end
