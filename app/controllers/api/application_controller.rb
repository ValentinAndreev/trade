# frozen_string_literal: true

class Api::ApplicationController < ActionController::API
  include ActionController::Cookies

  before_action :require_auth

  rescue_from ArgumentError, with: :bad_request
  rescue_from ActionController::ParameterMissing, with: :bad_request
  rescue_from Candle::IndicatorCalculator::UnknownIndicatorError, with: :bad_request
  rescue_from ActiveRecord::RecordNotFound, with: :not_found

  private

  def current_user
    return unless session[:user_id]

    @current_user ||= User.find_by(id: session[:user_id])
  end

  def require_auth
    render_api_error(:unauthorized, 'Unauthorized', status: :unauthorized) unless current_user
  end

  def bad_request(error) = render_api_error(:bad_request, error.message, status: :bad_request)

  def not_found(error) = render_api_error(:not_found, error.message, status: :not_found)

  def render_api_error(code, message, status:, details: {})
    render json: {
      error: {
        code: code.to_s,
        message:,
        details:
      }
    }, status:
  end
end
