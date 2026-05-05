# frozen_string_literal: true

require 'rails_helper'

RSpec.describe Ml::TrainingRunLifecycle do
  let(:valid_payload) do
    {
      model_key: 'btc_direction_lifecycle',
      display_name: 'BTC Direction Lifecycle',
      dataset_spec: {
        symbol: 'BTCUSD',
        exchange: 'bitfinex',
        timeframe: '1m',
        label_horizon: 1
      },
      feature_spec: [
        { type: 'log_return', params: { period: 1 } }
      ],
      hyperparams: { seed: 7, max_iterations: 20 }
    }
  end

  it 'rolls back model and run creation when enqueue fails' do
    lifecycle = described_class.new(enqueuer: ->(_run) { raise described_class::EnqueueFailed, 'queue unavailable' })
    run_count = MlTrainingRun.count

    expect {
      result = lifecycle.create(valid_payload)
      expect(result.status).to eq(:unprocessable_entity)
      expect(result.error.code).to eq(:enqueue_failed)
    }.not_to change(MlModel, :count)
    expect(MlTrainingRun.count).to eq(run_count)
  end

  it 'rejects non-positive label horizons before creating a run' do
    lifecycle = described_class.new(enqueuer: ->(_run) { })
    payload = valid_payload.deep_dup
    payload[:dataset_spec][:label_horizon] = 0

    expect {
      result = lifecycle.create(payload)
      expect(result.status).to eq(:unprocessable_entity)
      expect(result.error.code).to eq(:dataset_spec_invalid)
    }.not_to change(MlTrainingRun, :count)
  end

  it 'broadcasts queued progress after creating and enqueueing a run' do
    lifecycle = described_class.new(enqueuer: ->(_run) { })
    progress_broadcaster = instance_double(Ml::ProgressBroadcaster, queued: nil)
    allow(Ml::ProgressBroadcaster).to receive(:new).and_return(progress_broadcaster)

    result = lifecycle.create(valid_payload)

    expect(result).to be_success
    expect(progress_broadcaster).to have_received(:queued).with(training_run: result.training_run)
    expect(result.training_run.heartbeat_at).to be_present
  end

  it 'normalizes model keys before finding existing models' do
    model = create(:ml_model, key: 'btc_direction_lifecycle', display_name: 'Existing')
    lifecycle = described_class.new(enqueuer: ->(_run) { })
    result = nil

    expect {
      result = lifecycle.create(valid_payload.merge(model_key: ' BTC_DIRECTION_LIFECYCLE '))
    }.not_to change(MlModel, :count)

    expect(result).to be_success
    expect(result.model).to eq(model)
  end

  it 'cancels queued runs immediately and restores model status' do
    model = create(:ml_model, key: 'queued_cancel_model', serving_status: 'training')
    run = create(:ml_training_run, ml_model: model, status: 'queued')
    progress_broadcaster = instance_double(Ml::ProgressBroadcaster, cancelled: nil)
    allow(Ml::ProgressBroadcaster).to receive(:new).and_return(progress_broadcaster)

    result = described_class.new(enqueuer: ->(_run) { }).cancel(run.id)

    expect(result).to be_success
    expect(result.training_run.status).to eq('cancelled')
    expect(result.training_run.finished_at).to be_present
    expect(result.training_run.error_metadata).to include('code' => 'cancelled')
    expect(model.reload.serving_status).to eq('draft')
    expect(progress_broadcaster).to have_received(:cancelled).with(training_run: result.training_run)
  end

  it 'reconciles stale running jobs before permitting a replacement run' do
    model = create(:ml_model, key: 'btc_direction_lifecycle', serving_status: 'training')
    stale_run = create(
      :ml_training_run,
      :running,
      ml_model: model,
      heartbeat_at: 31.minutes.ago
    )
    lifecycle = described_class.new(enqueuer: ->(_run) { })

    result = lifecycle.create(valid_payload)

    expect(result).to be_success
    expect(result.training_run).not_to eq(stale_run)
    expect(stale_run.reload.status).to eq('failed')
    expect(stale_run.error_metadata).to include('code' => 'stale_worker')
    expect(model.reload.latest_failed_training_run).to eq(stale_run)
  end

  it 'reconciles stale queued jobs before permitting a replacement run' do
    model = create(:ml_model, key: 'btc_direction_lifecycle', serving_status: 'training')
    stale_run = create(
      :ml_training_run,
      ml_model: model,
      status: 'queued',
      heartbeat_at: 31.minutes.ago
    )
    lifecycle = described_class.new(enqueuer: ->(_run) { })

    result = lifecycle.create(valid_payload)

    expect(result).to be_success
    expect(result.training_run).not_to eq(stale_run)
    expect(stale_run.reload.status).to eq('failed')
    expect(stale_run.error_metadata).to include('code' => 'stale_worker')
  end

  it 'broadcasts stale heartbeat failures after permitting a replacement run' do
    model = create(:ml_model, key: 'btc_direction_lifecycle', serving_status: 'training')
    stale_run = create(:ml_training_run, :running, ml_model: model, heartbeat_at: 31.minutes.ago)
    lifecycle = described_class.new(enqueuer: ->(_run) { })
    events = []
    broadcaster_class = Class.new do
      def initialize(events)
        @events = events
      end

      def failed(training_run:)
        @events << [ :failed, training_run ]
      end

      def queued(training_run:)
        @events << [ :queued, training_run ]
      end
    end

    allow(Ml::ProgressBroadcaster).to receive(:new) do |**_kwargs|
      broadcaster_class.new(events)
    end

    result = lifecycle.create(valid_payload)

    expect(result).to be_success
    expect(events).to include([ :failed, stale_run ])
    expect(events).to include([ :queued, result.training_run ])
  end
end
