# frozen_string_literal: true

require 'rails_helper'

RSpec.describe Candle::Sync::Importer do
  subject(:importer) { described_class.new(symbol: 'BTCUSD') }

  before do
    allow(Rails.cache).to receive(:delete)
  end

  describe '#upsert_recent' do
    it 'upserts recent records and invalidates the max timestamp cache' do
      records = [ { ts: Time.utc(2026, 1, 1, 12, 0) } ]

      allow(Candle).to receive(:upsert_recent)

      importer.upsert_recent(records)

      expect(Candle).to have_received(:upsert_recent).with(records)
      expect(Rails.cache).to have_received(:delete).with('candle/max_ts/BTCUSD/bitfinex')
    end
  end

  describe '#import' do
    it 'imports records and invalidates both caches when requested' do
      ts1 = Time.utc(2026, 1, 1, 12, 0)
      ts2 = Time.utc(2026, 1, 1, 12, 1)

      allow(Candle).to receive(:import).and_return(double(rows: [ [ ts1 ], [ ts2 ] ]))

      result = importer.import([ { ts: ts1 }, { ts: ts2 } ], invalidate_min: true)

      expect(result).to eq([ ts1, ts2 ])
      expect(Rails.cache).to have_received(:delete).with('candle/max_ts/BTCUSD/bitfinex')
      expect(Rails.cache).to have_received(:delete).with('candle/min_ts/BTCUSD/bitfinex')
    end

    it 'does not invalidate the min cache when nothing was imported' do
      allow(Candle).to receive(:import).and_return(double(rows: []))

      result = importer.import([ { ts: Time.utc(2026, 1, 1, 12, 0) } ], invalidate_min: true)

      expect(result).to eq([])
      expect(Rails.cache).not_to have_received(:delete).with('candle/min_ts/BTCUSD/bitfinex')
    end
  end
end
