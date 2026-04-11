# frozen_string_literal: true

require 'rails_helper'

RSpec.describe Candle::Sync::Broadcaster do
  subject(:broadcaster) { described_class.new(symbol: 'BTCUSD', interval: '1m') }

  describe '#broadcast' do
    it 'formats and sorts candles before broadcasting them' do
      records = [
        { ts: Time.utc(2026, 1, 1, 12, 1), open: 2, high: 3, low: 1, close: 2.5, volume: 8 },
        { ts: Time.utc(2026, 1, 1, 12, 0), open: 1, high: 2, low: 0.5, close: 1.5, volume: 5 }
      ]

      expect(ActionCable.server).to receive(:broadcast).with(
        'candles:BTCUSD:1m',
        [
          { time: Time.utc(2026, 1, 1, 12, 0).to_i, open: 1.0, high: 2.0, low: 0.5, close: 1.5, volume: 5.0 },
          { time: Time.utc(2026, 1, 1, 12, 1).to_i, open: 2.0, high: 3.0, low: 1.0, close: 2.5, volume: 8.0 }
        ]
      )

      broadcaster.broadcast(records)
    end

    it 'does nothing when there are no records' do
      expect(ActionCable.server).not_to receive(:broadcast)

      broadcaster.broadcast([])
    end
  end
end
