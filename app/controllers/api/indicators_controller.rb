# frozen_string_literal: true

class Api::IndicatorsController < Api::ApplicationController
  def index
    render json: Candle::IndicatorCalculator.available
  end

  def show
    candles = Candle::FindQuery.new(
      symbol: params.require(:symbol),
      timeframe: params.fetch(:timeframe, '1m'),
      start_time: params[:start_time],
      end_time: params[:end_time]
    ).call

    calculator = Candle::IndicatorCalculator.new(candles)
    result = calculator.calculate(params.require(:type), **indicator_params)

    render json: result
  rescue TechnicalAnalysis::Validation::ValidationError => e
    render json: { error: e.message }, status: :unprocessable_entity
  end

  private

  def indicator_params
    params.except(:symbol, :timeframe, :type, :start_time, :end_time, :controller, :action, :format)
      .permit!
      .to_h
      .symbolize_keys
  end
end
