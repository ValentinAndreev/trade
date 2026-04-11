# frozen_string_literal: true

require 'rails_helper'

RSpec.describe Candle::Sync::Backfill do
  let(:paginator) { instance_double(Candle::Sync::Paginator, call: nil) }
  let(:backfill) { described_class.new(symbol: 'BTCUSD', paginator: paginator) }

  describe '#call' do
    it 'starts from the current time when there is no local history yet' do
      now = Time.utc(2026, 1, 1, 12, 0)

      allow(Time.zone).to receive(:now).and_return(now)
      allow(Candle).to receive(:min_ts).with(symbol: 'BTCUSD', exchange: 'bitfinex').and_return(nil)

      backfill.call

      expect(paginator).to have_received(:call).with(
        start_from: now.to_i * 1000,
        refresh_aggregates: true,
        invalidate_min: true
      )
    end

    it 'starts just before the earliest local candle when data already exists' do
      earliest = Time.utc(2026, 1, 1, 12, 0)

      allow(Candle).to receive(:min_ts).with(symbol: 'BTCUSD', exchange: 'bitfinex').and_return(earliest)

      backfill.call

      expect(paginator).to have_received(:call).with(
        start_from: (earliest.to_i - 60) * 1000,
        refresh_aggregates: true,
        invalidate_min: true
      )
    end

    it 'passes nil when the backfill boundary is older than supported history' do
      earliest = Time.utc(2016, 1, 1)

      allow(Candle).to receive(:min_ts).with(symbol: 'BTCUSD', exchange: 'bitfinex').and_return(earliest)

      backfill.call

      expect(paginator).to have_received(:call).with(
        start_from: nil,
        refresh_aggregates: true,
        invalidate_min: true
      )
    end
  end
end
