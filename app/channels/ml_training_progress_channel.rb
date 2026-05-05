# frozen_string_literal: true

class MlTrainingProgressChannel < ApplicationCable::Channel
  def subscribed
    training_run_id = params[:training_run_id].to_s
    return reject if training_run_id.blank?

    training_run = MlTrainingRun.find_by(id: training_run_id)
    return reject unless training_run

    stream_from Ml::ProgressBroadcaster.stream_name(training_run.id)
  end
end
