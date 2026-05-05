# frozen_string_literal: true

require 'rails_helper'

RSpec.describe MlTrainingProgressChannel, type: :channel do
  let(:user) { create(:user) }
  let(:training_run) { create(:ml_training_run) }

  before do
    stub_connection current_user: user
  end

  it 'streams from the training-run scoped progress stream' do
    subscribe(training_run_id: training_run.id)

    expect(subscription).to be_confirmed
    expect(subscription).to have_stream_from(Ml::ProgressBroadcaster.stream_name(training_run.id))
  end

  it 'rejects blank training run ids' do
    subscribe(training_run_id: '')

    expect(subscription).to be_rejected
  end

  it 'rejects unknown training run ids' do
    subscribe(training_run_id: MlTrainingRun.maximum(:id).to_i + 10_000)

    expect(subscription).to be_rejected
  end
end
