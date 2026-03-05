# frozen_string_literal: true

class Api::HealthController < Api::ApplicationController
  def show
    head :no_content
  end
end
