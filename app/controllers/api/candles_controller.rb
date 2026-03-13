# frozen_string_literal: true

class Api::CandlesController < Api::ApplicationController
  def index = render json: find_candles

  private

  def find_candles
    Candle::FindQuery.new(
      symbol: params.require(:symbol),
      exchange: params.fetch(:exchange, 'bitfinex'),
      timeframe: params.fetch(:timeframe, '1m'),
      start_time: params[:start_time],
      end_time: params[:end_time],
      limit: params[:limit]
    ).call
  end
end
