# frozen_string_literal: true

class Api::IndicatorsController < Api::ApplicationController
  def index
    render json: Candle::IndicatorCalculator.available
  end

  def compute
    candles = Candle::FindQuery.new(
      symbol: params.require(:symbol),
      timeframe: params.require(:timeframe),
      start_time: params[:start_time],
      limit: params[:start_time] ? nil : 1500
    ).call

    calculator = Candle::IndicatorCalculator.new(candles)
    result = calculator.calculate(params.require(:type), **indicator_params)

    render json: result
  rescue TechnicalAnalysis::Validation::ValidationError => e
    render json: { error: e.message }, status: :unprocessable_entity
  end

  private

  def indicator_params
    params.except(:symbol, :timeframe, :type, :start_time, :controller, :action, :format)
      .permit!
      .to_h
      .symbolize_keys
  end
end
