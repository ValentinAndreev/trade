# frozen_string_literal: true

require 'rails_helper'

RSpec.describe Research::Runs::ProgressSession do
  let(:broadcaster) { instance_double(Research::ProgressBroadcaster, started: nil, run_completed: nil, finished: nil, failed: nil) }

  before do
    allow(Research::ProgressBroadcaster).to receive(:new).with(run_id: 'run-123').and_return(broadcaster)
  end

  it 'delegates started without timing calculations' do
    allow(Process).to receive(:clock_gettime).and_return(100.0)

    session = described_class.new(run_id: 'run-123')
    session.started(total_runs: 3, mode: :optimization, target: 'ema.period')

    expect(broadcaster).to have_received(:started).with(total_runs: 3, mode: :optimization, target: 'ema.period')
  end

  it 'publishes progress with elapsed timings' do
    allow(Process).to receive(:clock_gettime).and_return(100.0, 104.0, 107.0)

    session = described_class.new(run_id: 'run-123')
    session.run_completed(total_runs: 4, completed_runs: 2, run_started_at: 103.0, current_value: 8)

    expect(broadcaster).to have_received(:run_completed).with(
      total_runs: 4,
      completed_runs: 2,
      current_value: 8,
      last_run_ms: 1000.0,
      elapsed_ms: 7000.0
    )
  end

  it 'publishes failed with elapsed time since session start' do
    allow(Process).to receive(:clock_gettime).and_return(100.0, 108.4)

    session = described_class.new(run_id: 'run-123')
    session.failed(message: 'boom', total_runs: 5, completed_runs: 1)

    expect(broadcaster).to have_received(:failed).with(
      message: 'boom',
      total_runs: 5,
      completed_runs: 1,
      elapsed_ms: be_within(0.001).of(8400.0)
    )
  end
end
