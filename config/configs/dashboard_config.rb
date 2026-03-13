class DashboardConfig < ApplicationConfig
  class << self
    def config_path = Rails.root.join('config/dashboard.yml')

    def current_path = Rails.root.join('config/dashboard.current.yml')

    def dashboard_all_symbols = fetch_path(config_data, 'dashboard', 'symbols', 'all')

    def dashboard_default_symbols = fetch_path(config_data, 'dashboard', 'symbols', 'default')

    def market_all_symbols = fetch_path(config_data, 'markets', 'symbols', 'all')

    def market_default_symbols = fetch_path(config_data, 'markets', 'symbols', 'default')

    def market_labels = fetch_path(config_data, 'markets', 'labels')

    def current_dashboard_symbols = fetch_path(current_data, 'dashboard', 'symbols')

    def current_market_symbols = fetch_path(current_data, 'markets', 'symbols')

    def update_current!(dashboard_symbols: nil, market_symbols: nil)
      data = current_data
      data['dashboard'] = { 'symbols' => dashboard_symbols } unless dashboard_symbols.nil?
      data['markets'] = { 'symbols' => market_symbols } unless market_symbols.nil?
      current_path.write(data.to_yaml)
    end

    def reset_current! = current_path.exist? ? current_path.delete : nil

    def ensure_current!
      return if current_path.exist?

      current_path.write(default_current_data.to_yaml)
    end

    private

    def config_data = load_yaml(config_path, 'dashboard config')

    def current_data
      ensure_current!
      load_yaml(current_path, 'dashboard current config')
    end

    def default_current_data
      {
        'dashboard' => { 'symbols' => dashboard_default_symbols },
        'markets' => { 'symbols' => market_default_symbols }
      }
    end

    def load_yaml(path, label)
      YAML.safe_load_file(path) || {}
    rescue Errno::ENOENT
      raise Errno::ENOENT, "#{label} is missing at #{path}"
    end

    def fetch_path(data, *keys) = keys.reduce(data, :fetch)
  end
end
