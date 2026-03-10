# frozen_string_literal: true

class Api::HealthController < Api::ApplicationController
  def show
    render json: { bitfinex: Utils::BitfinexHealth.reachable? }
  end
end
