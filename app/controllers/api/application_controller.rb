# frozen_string_literal: true

class Api::ApplicationController < ActionController::API
  rescue_from ArgumentError, with: :bad_request
  rescue_from ActiveRecord::RecordNotFound, with: :not_found

  private

  def bad_request(error)
    render json: { error: error.message }, status: :bad_request
  end

  def not_found(error)
    render json: { error: error.message }, status: :not_found
  end
end
