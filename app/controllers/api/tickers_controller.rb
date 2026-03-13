# frozen_string_literal: true

class Api::TickersController < Api::ApplicationController
  def index = render json: Candle::TickerQuery.new(Utils::SymbolStore.dashboard_symbols).call
end
