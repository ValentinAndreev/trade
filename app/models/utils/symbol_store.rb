# frozen_string_literal: true

class Utils::SymbolStore
  class << self
    def current_path = DashboardConfig.current_path

    def dashboard_symbols = BitfinexConfig.symbols

    def save_dashboard_symbols(symbols) = DashboardConfig.update_current!(dashboard_symbols: symbols)

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

    def market_symbols = MarketsConfig.symbols

    def save_market_symbols(symbols) = DashboardConfig.update_current!(market_symbols: symbols.to_h)

    def add_market_symbol(category, symbol)
      syms = market_symbols
      list = syms[category] ||= []
      return syms if list.include?(symbol)

      list << symbol
      save_market_symbols(syms)
      syms
    end

    def remove_market_symbol(category, symbol)
      syms = market_symbols
      syms[category]&.delete(symbol)
      save_market_symbols(syms)
      syms
    end

    # --- Preset helpers ---

    def reset! = DashboardConfig.reset_current!

    def snapshot
      {
        dashboardSymbols: dashboard_symbols,
        marketsSymbols:   market_symbols
      }
    end

    def restore!(dashboard_symbols: nil, market_symbols: nil)
      DashboardConfig.update_current!(
        dashboard_symbols: dashboard_symbols,
        market_symbols: market_symbols&.to_h
      )
    end
  end
end
