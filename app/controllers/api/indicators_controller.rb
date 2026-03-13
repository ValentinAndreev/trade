# frozen_string_literal: true

class Api::IndicatorsController < Api::ApplicationController
  ALLOWED_PARAMS = %i[period short_period long_period signal_period price_key].freeze

  def index = render json: Candle::IndicatorCalculator.available

  def compute
    candles = Candle::FindQuery.new(
      symbol:     params.require(:symbol),
      timeframe:  params.require(:timeframe),
      start_time: params[:start_time],
      limit:      params[:start_time] ? nil : 1500,
    ).call

    calculator = Candle::IndicatorCalculator.new(candles)
    result = calculator.calculate(params.require(:type), **indicator_params)

    render json: result
  rescue Candle::IndicatorCalculator::UnknownIndicatorError => e
    render json: { error: e.message }, status: :bad_request
  rescue TechnicalAnalysis::Validation::ValidationError => e
    render json: { error: e.message }, status: :unprocessable_entity
  end

  private

  def indicator_params
    params.slice(*ALLOWED_PARAMS).to_unsafe_h.symbolize_keys.transform_values do |v|
      v.is_a?(String) && v.match?(/\A-?\d+(\.\d+)?\z/) ? v.to_f : v
    end
  end
end
