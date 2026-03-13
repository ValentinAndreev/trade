# frozen_string_literal: true

class Api::ConfigsController < Api::ApplicationController
  def show = render json: { symbols: BitfinexConfig.available_symbols, timeframes: BitfinexConfig.timeframes }
end
