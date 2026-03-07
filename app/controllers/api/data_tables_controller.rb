# frozen_string_literal: true

class Api::DataTablesController < Api::ApplicationController
  def show
    candles = Candle::FindQuery.new(
      symbol: params.require(:symbol),
      timeframe: params.require(:timeframe),
      start_time: params[:start_time],
      end_time: params[:end_time],
      limit: params[:start_time] ? nil : (params[:limit] || 1500)
    ).call

    result = DataTable::Builder.new(candles)
      .with_indicators(indicator_specs)
      .with_changes(params[:changes])
      .build

    render json: result
  end

  def correlations
    symbol_a = params.require(:symbol_a)
    symbol_b = params.require(:symbol_b)
    timeframe = params.require(:timeframe)

    candles_a = Candle::FindQuery.new(symbol: symbol_a, timeframe: timeframe, limit: 500).call
    candles_b = Candle::FindQuery.new(symbol: symbol_b, timeframe: timeframe, limit: 500).call

    correlation = DataTable::CorrelationCalculator.from_candles(candles_a, candles_b, field: :close)

    render json: { symbol_a: symbol_a, symbol_b: symbol_b, timeframe: timeframe, correlation: correlation }
  end

  def statistics
    candles = Candle::FindQuery.new(
      symbol: params.require(:symbol),
      timeframe: params.require(:timeframe),
      start_time: params[:start_time],
      end_time: params[:end_time],
      limit: params[:start_time] ? nil : (params[:limit] || 1500)
    ).call

    rows = DataTable::Builder.new(candles)
      .with_indicators(indicator_specs)
      .with_changes(params[:changes])
      .build

    fields = Array(params[:fields]).presence || %w[close volume]
    result = fields.each_with_object({}) do |field, h|
      h[field] = DataTable::Statistics.from_rows(rows, field)
    end

    if params[:correlation_fields].present?
      corr_fields = Array(params[:correlation_fields])
      result[:correlation_matrix] = DataTable::Statistics.correlation_matrix(rows, corr_fields)
    end

    render json: result
  end

  private

  def indicator_specs
    return [] unless params[:indicators]

    specs = params[:indicators]
    specs = JSON.parse(specs) if specs.is_a?(String)
    Array(specs).map { |s| s.is_a?(Hash) ? s : JSON.parse(s) }
  rescue JSON::ParserError
    []
  end
end
