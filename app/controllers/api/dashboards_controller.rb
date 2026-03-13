# frozen_string_literal: true

class Api::DashboardsController < Api::ApplicationController
  def add
    symbol = params.require(:symbol)
    unless BitfinexConfig.available_symbols.include?(symbol)
      return render json: { error: "Unknown symbol: #{symbol}" }, status: :bad_request
    end

    render json: { symbols: Utils::SymbolStore.add_dashboard_symbol(symbol) }
  end

  def remove
    symbol = params.require(:symbol)
    render json: { symbols: Utils::SymbolStore.remove_dashboard_symbol(symbol) }
  end
end
