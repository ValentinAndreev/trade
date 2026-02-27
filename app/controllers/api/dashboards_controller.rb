# frozen_string_literal: true

class Api::DashboardsController < Api::ApplicationController
  def add
    symbol = params.require(:symbol)
    symbols = load_symbols
    symbols << symbol unless symbols.include?(symbol)
    save_symbols(symbols)
    render json: { symbols: symbols }
  end

  def remove
    symbol = params.require(:symbol)
    symbols = load_symbols
    symbols.delete(symbol)
    save_symbols(symbols)
    render json: { symbols: symbols }
  end

  private

  YAML_PATH = Rails.root.join('config/dashboard.yml')

  def load_symbols
    return BitfinexConfig.new.symbols unless YAML_PATH.exist?

    data = YAML.safe_load_file(YAML_PATH)
    data&.fetch('symbols', nil) || BitfinexConfig.new.symbols
  end

  def save_symbols(symbols)
    YAML_PATH.write({ 'symbols' => symbols }.to_yaml)
  end
end
