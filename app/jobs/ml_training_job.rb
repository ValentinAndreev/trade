# frozen_string_literal: true

class MlTrainingJob < ApplicationJob
  queue_as :ml

  def perform(training_run_id)
    training_run = MlTrainingRun.find(training_run_id)
    return if training_run.terminal?

    if training_run.cancellation_requested?
      mark_cancelled_before_start!(training_run)
      return
    end

    Ml::TrainingRunner.new(training_run:).call
  rescue StandardError => e
    mark_failed!(training_run_id, e)
  end

  private

  def mark_cancelled_before_start!(training_run)
    training_run.update!(
      status: 'cancelled',
      finished_at: Time.current,
      error_metadata: { code: 'cancelled', message: 'training was cancelled before start' },
      weight_checksum: nil
    )
    Ml::ProgressBroadcaster.new(training_run:).cancelled(training_run:)
  end

  def mark_failed!(training_run_id, error)
    training_run = MlTrainingRun.find_by(id: training_run_id)
    return unless training_run && !training_run.terminal?

    training_run.update!(
      status: 'failed',
      finished_at: Time.current,
      error_metadata: { code: 'training_job_error', message: error.message },
      weight_checksum: nil
    )
    training_run.ml_model.update!(
      serving_status: training_run.ml_model.trained? ? training_run.ml_model.serving_status : 'failed',
      latest_failed_training_run: training_run
    )
    Ml::ProgressBroadcaster.new(training_run:).failed(training_run:)
  end
end
