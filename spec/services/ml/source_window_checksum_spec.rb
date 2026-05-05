# frozen_string_literal: true

require 'rails_helper'

RSpec.describe Ml::SourceWindowChecksum do
  let(:fixture_candles) do
    Array.new(5) do |index|
      {
        time: (Time.utc(2026, 1, 1) + index.minutes).to_i,
        open: 100.0 + index,
        high: 101.0 + index,
        low: 99.0 + index,
        close: 100.5 + index,
        volume: 10.0 + index
      }
    end
  end

  describe '.canonical_row' do
    it 'canonicalizes UTC timestamps and fixed-scale decimal fields' do
      candle = {
        ts: Time.new(2026, 1, 1, 3, 0, 0, '+03:00'),
        open: '1.23456789014',
        high: '2',
        low: '0.00001',
        close: '1.5',
        volume: '10'
      }

      expect(described_class.canonical_row(candle)).to eq(
        "ml-candle-v1\0" \
        "close=1.5000000000\0" \
        "high=2.0000000000\0" \
        "low=0.0000100000\0" \
        "open=1.2345678901\0" \
        "ts=2026-01-01T00:00:00.000000Z\0" \
        'volume=10.0000000000'
      )
      expect(described_class.leaf_hexdigest(candle)).to eq(
        '3bc136dc8c08f672ebf8bc9877595d761e774d995ba66f36864cd26f7353bf54'
      )
    end
  end

  describe '#ordered_covering_hashes' do
    it 'pins odd-node duplication behavior' do
      checksum = described_class.new(fixture_candles)

      expect(checksum.root_hexdigest).to eq(
        '9b04b18841584907d9db5968d0d4a5a6aaa11e2e3451d74d04fca4f4083c7951'
      )
      expect(checksum.ordered_covering_hashes(start_index: 4, end_index: 4)).to eq(
        [ 'c0ba1e5a7f2ace15b7a89da1f3a8cfc97bde6193d7b51d9ea5852f65b3012f12' ]
      )
    end
  end

  describe '#window_checksum' do
    it 'pins a multi-row source-window digest' do
      checksum = described_class.new(fixture_candles)

      expect(checksum.window_checksum(start_index: 1, end_index: 4)).to eq(
        '3717f31b3af95c54befd03843d37e2dcccce12d2ccfc1917c434cc39c275619e'
      )
    end
  end
end
