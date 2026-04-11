# frozen_string_literal: true

require 'rails_helper'

RSpec.describe Candle::Sync::Recent do
  let(:history_source) { instance_double(Candle::Sync::HistorySource) }
  let(:importer) { instance_double(Candle::Sync::Importer, upsert_recent: nil) }
  let(:broadcaster) { instance_double(Candle::Sync::Broadcaster, broadcast: nil) }
  let(:paginator) { instance_double(Candle::Sync::Paginator, call: nil) }
  let(:recent) do
    described_class.new(
      symbol: 'BTCUSD',
      interval: '1m',
      history_source: history_source,
      importer: importer,
      broadcaster: broadcaster,
      paginator: paginator
    )
  end

  describe '#call' do
    it 'delegates to paginator when there is no local max timestamp yet' do
      now = Time.utc(2026, 1, 1, 12, 0)

      allow(Time.zone).to receive(:now).and_return(now)
      allow(Candle).to receive(:max_ts).with(symbol: 'BTCUSD', exchange: 'bitfinex').and_return(nil)
      allow(history_source).to receive(:fetch_records)

      recent.call

      expect(paginator).to have_received(:call).with(start_from: now.to_i * 1000)
      expect(history_source).not_to have_received(:fetch_records)
    end

    it 'fetches, upserts and broadcasts recent records when there is a gap' do
      now = Time.utc(2026, 1, 1, 12, 0)
      records = [ { ts: now - 1.minute, close: 50_000 } ]

      allow(Time.zone).to receive(:now).and_return(now)
      allow(Candle).to receive(:max_ts).with(symbol: 'BTCUSD', exchange: 'bitfinex').and_return(now - 7.minutes)
      allow(history_source).to receive(:fetch_records).with(end_time: now.to_i * 1000, limit: 9).and_return(records)

      recent.call

      expect(importer).to have_received(:upsert_recent).with(records)
      expect(broadcaster).to have_received(:broadcast).with(records)
    end

    it 'uses the minimum recent fetch window for small gaps' do
      now = Time.utc(2026, 1, 1, 12, 0)
      records = [ { ts: now - 1.minute, close: 50_000 } ]

      allow(Time.zone).to receive(:now).and_return(now)
      allow(Candle).to receive(:max_ts).with(symbol: 'BTCUSD', exchange: 'bitfinex').and_return(now - 1.minute)
      allow(history_source).to receive(:fetch_records).with(
        end_time: now.to_i * 1000,
        limit: Candle::Fetcher::MIN_RECENT_FETCH_LIMIT
      ).and_return(records)

      recent.call

      expect(importer).to have_received(:upsert_recent).with(records)
      expect(broadcaster).to have_received(:broadcast).with(records)
    end

    it 'does not upsert or broadcast when the source returns nothing' do
      now = Time.utc(2026, 1, 1, 12, 0)

      allow(Time.zone).to receive(:now).and_return(now)
      allow(Candle).to receive(:max_ts).with(symbol: 'BTCUSD', exchange: 'bitfinex').and_return(now - 7.minutes)
      allow(history_source).to receive(:fetch_records).and_return([])

      recent.call

      expect(importer).not_to have_received(:upsert_recent)
      expect(broadcaster).not_to have_received(:broadcast)
    end
  end
end
