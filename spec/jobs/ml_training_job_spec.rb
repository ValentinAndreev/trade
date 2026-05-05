# frozen_string_literal: true

require 'rails_helper'

RSpec.describe MlTrainingJob do
  it 'uses the constrained ML queue' do
    expect(described_class.queue_name).to eq('ml')
  end

  it 'runs the training runner for queued runs' do
    run = create(:ml_training_run, status: 'queued')
    runner_result = Ml::TrainingRunner::Result.new(status: :succeeded, training_run: run, adapter_result: nil, error: nil)
    runner = instance_double(Ml::TrainingRunner, call: runner_result)

    allow(Ml::TrainingRunner).to receive(:new).with(training_run: run).and_return(runner)

    described_class.perform_now(run.id)

    expect(runner).to have_received(:call)
  end

  it 'does not rerun terminal runs' do
    run = create(:ml_training_run, :succeeded)
    allow(Ml::TrainingRunner).to receive(:new)

    described_class.perform_now(run.id)

    expect(Ml::TrainingRunner).not_to have_received(:new)
  end

  it 'marks runs cancelled when cancellation was requested before start' do
    model = create(:ml_model, serving_status: 'training')
    run = create(:ml_training_run, status: 'queued', ml_model: model, cancellation_requested_at: Time.current)
    progress_broadcaster = instance_double(Ml::ProgressBroadcaster, cancelled: nil)
    allow(Ml::TrainingRunner).to receive(:new)
    allow(Ml::ProgressBroadcaster).to receive(:new).with(training_run: run).and_return(progress_broadcaster)

    described_class.perform_now(run.id)

    expect(Ml::TrainingRunner).not_to have_received(:new)
    expect(run.reload.status).to eq('cancelled')
    expect(run.error_metadata).to include('code' => 'cancelled')
    expect(model.reload.serving_status).to eq('draft')
    expect(progress_broadcaster).to have_received(:cancelled).with(training_run: run)
  end

  it 'rolls back pre-start cancellation state when the model terminal update fails' do
    model = create(:ml_model, serving_status: 'training')
    run = create(:ml_training_run, status: 'queued', ml_model: model, cancellation_requested_at: Time.current)
    model.update_columns(architecture: 'invalid_architecture')

    expect { described_class.new.send(:mark_cancelled_before_start!, run) }
      .to raise_error(ActiveRecord::RecordInvalid)

    expect(run.reload.status).to eq('queued')
    expect(model.reload.serving_status).to eq('training')
  end

  it 'persists structured job failures and marks latest failed run' do
    model = create(:ml_model)
    run = create(:ml_training_run, status: 'queued', ml_model: model)
    runner = instance_double(Ml::TrainingRunner)
    progress_broadcaster = instance_double(Ml::ProgressBroadcaster, failed: nil)

    allow(Ml::TrainingRunner).to receive(:new).and_return(runner)
    allow(runner).to receive(:call).and_raise('boom')
    allow(Ml::ProgressBroadcaster).to receive(:new).with(training_run: run).and_return(progress_broadcaster)

    expect { described_class.perform_now(run.id) }.to raise_error(RuntimeError, 'boom')

    expect(run.reload.status).to eq('failed')
    expect(run.error_metadata).to include('code' => 'training_job_error', 'message' => 'boom')
    expect(model.reload.latest_failed_training_run).to eq(run)
    expect(progress_broadcaster).to have_received(:failed).with(training_run: run)
  end

  it 'rolls back failed state when the model failure marker cannot be persisted' do
    model = create(:ml_model, serving_status: 'training')
    run = create(:ml_training_run, status: 'queued', ml_model: model)
    model.update_columns(architecture: 'invalid_architecture')

    expect { described_class.new.send(:mark_failed!, run.id, RuntimeError.new('boom')) }
      .to raise_error(ActiveRecord::RecordInvalid)

    expect(run.reload.status).to eq('queued')
    expect(model.reload.serving_status).to eq('training')
    expect(model.latest_failed_training_run_id).to be_nil
  end
end
