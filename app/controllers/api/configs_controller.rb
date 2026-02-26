# frozen_string_literal: true

module Api
  class ConfigsController < ApplicationController
    def show
      config = BitfinexConfig.new

      render json: { symbols: config.symbols, timeframes: config.timeframes }
    end
  end
end
