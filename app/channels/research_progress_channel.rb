# frozen_string_literal: true

class ResearchProgressChannel < ApplicationCable::Channel
  def subscribed
    run_id = params[:run_id].to_s
    return reject if run_id.blank?

    stream_from "research:#{run_id}"
  end
end
