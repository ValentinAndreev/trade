# frozen_string_literal: true

class Utils::SymbolStore
  DASHBOARD_PATH = Rails.root.join('config/dashboard.yml')
  MARKETS_PATH   = Rails.root.join('config/markets.yml')

  class << self
    # --- Dashboard (crypto) symbols ---

    def dashboard_symbols
      read_yaml(DASHBOARD_PATH, 'symbols') || BitfinexConfig.symbols
    end

    def save_dashboard_symbols(symbols)
      write_yaml(DASHBOARD_PATH, 'symbols' => Array(symbols).sort)
    end

    def add_dashboard_symbol(symbol)
      syms = dashboard_symbols
      return syms if syms.include?(symbol)

      syms << symbol
      save_dashboard_symbols(syms)
      syms
    end

    def remove_dashboard_symbol(symbol)
      syms = dashboard_symbols
      syms.delete(symbol)
      save_dashboard_symbols(syms)
      syms
    end

    # --- Market symbols (indices, forex, commodities) ---

    def market_symbols
      raw = read_yaml(MARKETS_PATH, 'symbols')
      return default_market_symbols unless raw

      raw.transform_keys(&:to_s).transform_values { |v| Array(v) }
    end

    def save_market_symbols(symbols)
      sorted = symbols.transform_values { |v| Array(v).sort }
                       .sort_by { |k, _| k }.to_h
      write_yaml(MARKETS_PATH, 'symbols' => sorted)
    end

    def add_market_symbol(category, symbol)
      syms = market_symbols
      list = syms[category.to_s] ||= []
      return syms if list.include?(symbol)

      list << symbol
      save_market_symbols(syms)
      syms
    end

    def remove_market_symbol(category, symbol)
      syms = market_symbols
      syms[category.to_s]&.delete(symbol)
      save_market_symbols(syms)
      syms
    end

    # --- Preset helpers ---

    def reset!
      DASHBOARD_PATH.delete if DASHBOARD_PATH.exist?
      MARKETS_PATH.delete   if MARKETS_PATH.exist?
    end

    def snapshot
      {
        dashboardSymbols: (DASHBOARD_PATH.exist? ? read_yaml(DASHBOARD_PATH, 'symbols') : nil),
        marketsSymbols:   (MARKETS_PATH.exist?   ? read_yaml(MARKETS_PATH, 'symbols')   : nil)
      }
    end

    def restore!(dashboard_symbols: nil, market_symbols: nil)
      save_dashboard_symbols(dashboard_symbols) if dashboard_symbols.is_a?(Array)
      save_market_symbols(market_symbols)        if market_symbols.is_a?(Hash)
    end

    private

    def default_market_symbols
      MarketsConfig.symbols.transform_keys(&:to_s).transform_values { |v| Array(v) }
    end

    def read_yaml(path, key)
      return nil unless path.exist?

      data = YAML.safe_load_file(path)
      data&.fetch(key, nil)
    end

    def write_yaml(path, data)
      path.write(data.to_yaml)
    end
  end
end
