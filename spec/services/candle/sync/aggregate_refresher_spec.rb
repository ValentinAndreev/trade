# frozen_string_literal: true

require 'rails_helper'

RSpec.describe Candle::Sync::AggregateRefresher do
  subject(:refresher) { described_class.new(connection: connection) }

  let(:connection) { instance_double(ActiveRecord::ConnectionAdapters::AbstractAdapter, execute: nil) }

  describe '#refresh' do
    it 'refreshes each configured continuous aggregate' do
      timestamps = [ Time.utc(2026, 1, 1, 12, 0), Time.utc(2026, 1, 1, 12, 5) ]

      refresher.refresh(timestamps)

      expect(connection).to have_received(:execute).exactly(Candle::Sync::AggregateRefresher::CONTINUOUS_AGGREGATE_BUCKETS.size).times
    end

    it 'does nothing for blank timestamps' do
      refresher.refresh([])

      expect(connection).not_to have_received(:execute)
    end
  end
end
