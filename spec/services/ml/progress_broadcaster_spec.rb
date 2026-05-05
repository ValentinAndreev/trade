# frozen_string_literal: true

require 'rails_helper'

RSpec.describe Ml::ProgressBroadcaster do
  class BroadcastCollector
    attr_reader :messages

    def initialize
      @messages = []
    end

    def broadcast(stream, payload)
      messages << [ stream, payload ]
    end
  end

  let(:training_run) { create(:ml_training_run, :running) }
  let(:collector) { BroadcastCollector.new }

  it 'uses a stable training-run scoped stream name' do
    expect(described_class.stream_name(training_run.id)).to eq("ml_training:#{training_run.id}")
  end

  it 'broadcasts queued and terminal events without progress throttling' do
    broadcaster = described_class.new(training_run:, broadcast_adapter: collector)

    broadcaster.queued(training_run:)
    training_run.update!(status: 'failed', error_metadata: { code: 'adapter_error', message: 'boom' })
    broadcaster.failed(training_run:)

    expect(collector.messages.map { |_stream, payload| payload.fetch(:event) }).to eq(%w[queued failed])
    expect(collector.messages.last.last).to include(
      event: 'failed',
      status: 'failed',
      training_run_id: training_run.id,
      error: include('code' => 'adapter_error', 'message' => 'boom')
    )
  end

  it 'dedupes repeated progress and throttles small changes to once per second' do
    ticks = [ 0.0, 0.2, 0.4, 0.5, 1.6 ]
    broadcaster = described_class.new(
      training_run:,
      clock: -> { ticks.shift || 2.0 },
      broadcast_adapter: collector
    )

    broadcaster.progress(training_run:, stage: 'training', iteration: 1, max_iterations: 100)
    broadcaster.progress(training_run:, stage: 'training', iteration: 1, max_iterations: 100)
    broadcaster.progress(training_run:, stage: 'training', iteration: 1.5, max_iterations: 100)
    broadcaster.progress(training_run:, stage: 'training', iteration: 2, max_iterations: 100)
    broadcaster.progress(training_run:, stage: 'training', iteration: 2.4, max_iterations: 100)
    broadcaster.progress(training_run:, stage: 'training', iteration: 2.5, max_iterations: 100)

    expect(collector.messages.map { |_stream, payload| payload.fetch(:progress_percent) }).to eq([ 1.0, 2.0, 2.5 ])
  end

  it 'emits terminal events even when the previous progress event was throttled' do
    ticks = [ 0.0, 0.2 ]
    broadcaster = described_class.new(
      training_run:,
      clock: -> { ticks.shift || 0.3 },
      broadcast_adapter: collector
    )

    broadcaster.progress(training_run:, stage: 'training', iteration: 1, max_iterations: 100)
    broadcaster.progress(training_run:, stage: 'training', iteration: 1.2, max_iterations: 100)
    training_run.update!(status: 'cancelled')
    broadcaster.cancelled(training_run:)

    expect(collector.messages.map { |_stream, payload| payload.fetch(:event) }).to eq(%w[progress cancelled])
  end
end
