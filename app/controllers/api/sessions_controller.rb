# frozen_string_literal: true

class Api::SessionsController < Api::ApplicationController
  def create
    user = User.find_by(username: params[:username])

    if user&.authenticate(params[:password])
      session[:user_id] = user.id
      render json: { user: user_json(user) }
    else
      render json: { error: 'Invalid username or password' }, status: :unauthorized
    end
  end

  def show
    if current_user
      render json: { user: user_json(current_user) }
    else
      render json: { user: nil }
    end
  end

  def destroy
    session.delete(:user_id)
    render json: { ok: true }
  end

  private

  def user_json(user)
    {
      id: user.id,
      username: user.username,
      presets: user.presets.order(:name).map { |p|
        { id: p.id, name: p.name, is_default: p.is_default }
      }
    }
  end
end
