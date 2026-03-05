# frozen_string_literal: true

class Api::ApplicationController < ActionController::API
  include ActionController::Cookies

  rescue_from ArgumentError, with: :bad_request
  rescue_from ActiveRecord::RecordNotFound, with: :not_found

  private

  def current_user
    @current_user ||= User.find_by(id: session[:user_id]) if session[:user_id]
  end

  def require_auth
    render json: { error: "Unauthorized" }, status: :unauthorized unless current_user
  end

  def bad_request(error)
    render json: { error: error.message }, status: :bad_request
  end

  def not_found(error)
    render json: { error: error.message }, status: :not_found
  end
end
