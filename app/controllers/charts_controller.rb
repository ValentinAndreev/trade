# frozen_string_literal: true

class ChartsController < ApplicationController
  def show
    @symbol = 'BTCUSD'
    @timeframe = '1m'
  end
end
