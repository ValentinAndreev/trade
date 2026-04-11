# frozen_string_literal: true

class Api::DataTablesController < Api::ApplicationController
  def show = render json: build_rows

  def statistics
    rows = build_rows

    fields = Array(params[:fields]).presence || %w[close volume]
    result = fields.each_with_object({}) do |field, h|
      h[field] = DataTable::Statistics.from_rows(rows, field)
    end

    render json: result
  end

  private

  def fetch_candles
    Candle::FindQuery.new(
      symbol: params.require(:symbol),
      timeframe: params.require(:timeframe),
      start_time: params[:start_time],
      end_time: params[:end_time],
      limit: params[:start_time] ? nil : (params[:limit] || 1500)
    ).call
  end

  def build_rows
    DataTable::Builder.new(fetch_candles)
      .with_indicators(indicator_specs)
      .with_changes(params[:changes])
      .build
  end

  def indicator_specs
    return [] unless params[:indicators]

    specs = params[:indicators]
    specs = JSON.parse(specs) if specs.is_a?(String)
    Array(specs).map { |s| s.is_a?(Hash) ? s : JSON.parse(s) }
  rescue JSON::ParserError
    []
  end
end
