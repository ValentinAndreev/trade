# frozen_string_literal: true

class Api::ConfigsController < Api::ApplicationController
  def show
    render json: { symbols: BitfinexConfig.symbols, timeframes: BitfinexConfig.timeframes }
  end
end
