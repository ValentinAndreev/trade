# frozen_string_literal: true

module Api
  class ConfigsController < ApplicationController
    def show
      config = BitfinexConfig.new

      render json: { symbols: config.symbols.map { |s| s.delete_prefix('t') }, timeframes: config.timeframes }
    end
  end
end
