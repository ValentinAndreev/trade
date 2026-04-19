# frozen_string_literal: true

class Api::MacroSeriesController < Api::ApplicationController
  def index
    indicators = Array(params[:indicators].presence)
      .map(&:to_s)
      .select { |i| MacroConfig.indicator_keys.include?(i) }
      .uniq

    return render json: { error: 'No valid indicators' }, status: :bad_request if indicators.empty?

    render json: Macro::FindQuery.new(indicators:, from: params[:from], to: params[:to]).call
  end
end
