# frozen_string_literal: true

class Api::IndicatorsController < Api::ApplicationController
  def index
    render json: Candle::IndicatorCalculator.available
  end

  def show
    candles = Candle
      .for_symbol(params.require(:symbol))
      .for_timeframe(params.fetch(:timeframe, '1m'))
      .in_range(time_range_start, time_range_end)

    calculator = Candle::IndicatorCalculator.new(candles)
    result = calculator.calculate(params.require(:type), **indicator_params)

    render json: result
  end

  private

  def time_range_start
    params[:start_time] ? Time.zone.parse(params[:start_time]) : 30.days.ago
  end

  def time_range_end
    params[:end_time] ? Time.zone.parse(params[:end_time]) : Time.current
  end

  def indicator_params
    params.except(:symbol, :timeframe, :type, :start_time, :end_time, :controller, :action, :format)
      .permit!
      .to_h
      .symbolize_keys
  end
end
