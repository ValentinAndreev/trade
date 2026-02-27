# frozen_string_literal: true

module Api
  class ConfigsController < ApplicationController
    def show
      render json: { symbols: BitfinexConfig.symbols, timeframes: BitfinexConfig.timeframes }
    end
  end
end
