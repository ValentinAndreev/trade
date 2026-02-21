class BitfinexConfig < ApplicationConfig
  attr_config :api_url,
    symbols: %w[tBTCUSD tETHUSD tSOLUSD tXRPUSD],
    rate_limit_pause: 2,
    batch_size: 5000,
    default_interval: '1m'

  def api_url
    super || 'https://api-pub.bitfinex.com/v2'
  end
end
