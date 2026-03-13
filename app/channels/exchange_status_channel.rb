# frozen_string_literal: true

class ExchangeStatusChannel < ApplicationCable::Channel
  def subscribed = stream_from 'exchange:status'
end
