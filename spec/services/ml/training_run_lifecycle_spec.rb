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
    lifecycle = described_class.new(enqueuer: ->(_run) { raise 'queue unavailable' })
    run_count = MlTrainingRun.count

    expect {
      result = lifecycle.create(valid_payload)
      expect(result.status).to eq(:unprocessable_entity)
      expect(result.error.code).to eq(:enqueue_failed)
    }.not_to change(MlModel, :count)
    expect(MlTrainingRun.count).to eq(run_count)
  end

  it 'broadcasts queued progress after creating and enqueueing a run' do
    lifecycle = described_class.new(enqueuer: ->(_run) { })
    progress_broadcaster = instance_double(Ml::ProgressBroadcaster, queued: nil)
    allow(Ml::ProgressBroadcaster).to receive(:new).and_return(progress_broadcaster)

    result = lifecycle.create(valid_payload)

    expect(result).to be_success
    expect(progress_broadcaster).to have_received(:queued).with(training_run: result.training_run)
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
