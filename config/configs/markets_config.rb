class MarketsConfig < ApplicationConfig
  attr_config \
    api_url: 'https://query1.finance.yahoo.com/v8/finance/chart',
    user_agent: 'Mozilla/5.0',
    open_timeout: 5,
    read_timeout: 5,
    cache_ttl: 60

  def symbols = DashboardConfig.current_market_symbols

  def available = DashboardConfig.market_all_symbols

  def default_symbols = DashboardConfig.market_default_symbols

  def labels = DashboardConfig.market_labels
end
