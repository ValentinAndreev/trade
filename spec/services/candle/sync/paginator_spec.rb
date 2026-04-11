# frozen_string_literal: true

require 'rails_helper'

RSpec.describe Candle::Sync::Paginator do
  subject(:paginator) do
    described_class.new(
      history_source: history_source,
      importer: importer,
      broadcaster: broadcaster,
      aggregate_refresher: aggregate_refresher,
      rate_limit_pause: 0
    )
  end

  let(:history_source) { instance_double(Candle::Sync::HistorySource) }
  let(:importer) { instance_double(Candle::Sync::Importer) }
  let(:broadcaster) { instance_double(Candle::Sync::Broadcaster, broadcast: nil) }
  let(:aggregate_refresher) { instance_double(Candle::Sync::AggregateRefresher, refresh: nil) }

  describe '#call' do
    it 'broadcasts only imported records from the first batch and refreshes aggregates' do
      ts1 = Time.utc(2026, 1, 1, 12, 0)
      ts2 = Time.utc(2026, 1, 1, 11, 59)
      ts3 = Time.utc(2026, 1, 1, 11, 58)
      batch_one = [ { ts: ts1, close: 1 }, { ts: ts2, close: 2 } ]
      batch_two = [ { ts: ts3, close: 3 } ]

      allow(history_source).to receive(:fetch_records).and_return(batch_one, batch_two, [])
      allow(importer).to receive(:import).with(batch_one, invalidate_min: true).and_return([ ts2 ])
      allow(importer).to receive(:import).with(batch_two, invalidate_min: true).and_return([ ts3 ])

      paginator.call(start_from: Time.utc(2026, 1, 1, 12, 1).to_i * 1000, refresh_aggregates: true, invalidate_min: true)

      expect(broadcaster).to have_received(:broadcast).once.with([ { ts: ts2, close: 2 } ])
      expect(aggregate_refresher).to have_received(:refresh).with([ ts2 ])
      expect(aggregate_refresher).to have_received(:refresh).with([ ts3 ])
    end

    it 'stops when the history source returns no records' do
      allow(history_source).to receive(:fetch_records).and_return([])
      allow(importer).to receive(:import)

      paginator.call(start_from: Time.utc(2026, 1, 1, 12, 1).to_i * 1000)

      expect(importer).not_to have_received(:import)
      expect(broadcaster).not_to have_received(:broadcast)
    end
  end
end
