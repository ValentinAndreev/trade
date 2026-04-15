# frozen_string_literal: true

class Api::HealthController < Api::ApplicationController
  skip_before_action :require_auth

  def show = render json: { bitfinex: Utils::BitfinexHealth.reachable? }
end
