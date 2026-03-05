# frozen_string_literal: true

require 'rails_helper'

RSpec.describe CandleSyncJob do
  it 'enqueues CandleSyncSymbolJob for each symbol' do
    symbols = BitfinexConfig.symbols

    expect {
      described_class.perform_now
    }.to have_enqueued_job(CandleSyncSymbolJob).exactly(symbols.count).times
  end

  it 'staggers jobs with different scheduled times' do
    described_class.perform_now

    enqueued = ActiveJob::Base.queue_adapter.enqueued_jobs
                 .select { |j| j['job_class'] == 'CandleSyncSymbolJob' }
    scheduled = enqueued.map { |j| j['scheduled_at'] }.compact
    expect(scheduled.uniq.size).to be > 1
  end
end
