# frozen_string_literal: true

class MlTrainingJob < ApplicationJob
  queue_as :ml
  self.enqueue_after_transaction_commit = true

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
    raise
  end

  private

  def mark_cancelled_before_start!(training_run)
    ActiveRecord::Base.transaction do
      training_run.update!(
        status: 'cancelled',
        finished_at: Time.current,
        error_metadata: { code: 'cancelled', message: 'training was cancelled before start' },
        weight_checksum: nil
      )
      restore_model_status_after_cancellation!(training_run.ml_model)
    end
    broadcast_terminal(:cancelled, training_run:)
  end

  def restore_model_status_after_cancellation!(model)
    model.update!(serving_status: serving_status_after_cancellation(model))
  end

  def serving_status_after_cancellation(model)
    return 'trained' if model.latest_successful_training_run_id.present?
    return 'failed' if model.latest_failed_training_run_id.present?

    'draft'
  end

  def mark_failed!(training_run_id, error)
    training_run = MlTrainingRun.find_by(id: training_run_id)
    return unless training_run && !training_run.terminal?

    model = training_run.ml_model
    ActiveRecord::Base.transaction do
      training_run.update!(
        status: 'failed',
        finished_at: Time.current,
        error_metadata: { code: 'training_job_error', message: error.message },
        weight_checksum: nil
      )
      model.update!(
        serving_status: model.trained? ? model.serving_status : 'failed',
        latest_failed_training_run: training_run
      )
    end
    broadcast_terminal(:failed, training_run:)
  end

  def broadcast_terminal(event, training_run:)
    Ml::ProgressBroadcaster.safely_broadcast_terminal(event, training_run:)
  end
end
