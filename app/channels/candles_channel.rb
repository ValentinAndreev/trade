# frozen_string_literal: true

class CandlesChannel < ApplicationCable::Channel
  def subscribed
    stream_from "candles:#{params[:symbol]}:#{params[:timeframe]}"
  end
end
