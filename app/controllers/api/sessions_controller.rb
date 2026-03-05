# frozen_string_literal: true

class Api::SessionsController < Api::ApplicationController
  def create
    user = User.find_by(username: params[:username])

    if user&.authenticate(params[:password])
      session[:user_id] = user.id
      render json: { user: user.as_api_json }
    else
      render json: { error: 'Invalid username or password' }, status: :unauthorized
    end
  end

  def show
    if current_user
      render json: { user: current_user.as_api_json }
    else
      render json: { user: nil }
    end
  end

  def destroy
    session.delete(:user_id)
    render json: { ok: true }
  end
end
