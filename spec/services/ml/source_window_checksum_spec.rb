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

    it 'pins decimal precision beyond float mantissa limits' do
      decimal = BigDecimal('123456789012.1234567891')

      expect(described_class.canonical_decimal(decimal)).to eq('123456789012.1234567891')
      expect(described_class.canonical_decimal(decimal.to_f)).not_to eq('123456789012.1234567891')
    end

    it 'rejects missing decimal fields explicitly' do
      expect { described_class.canonical_decimal(nil) }.to raise_error(ArgumentError, /candle decimal value is missing/)
    end

    it 'keeps candle_time private' do
      expect(described_class.private_methods).to include(:candle_time)
    end
  end

  describe '#window_checksum' do
    it 'pins a multi-row source-window digest' do
      checksum = described_class.new(fixture_candles)

      expect(checksum.window_checksum(start_index: 1, end_index: 4)).to eq(
        '882e15e8f112097d19d47dd8a4b171b8d28bf1613410082d5fbb38f0a5be1214'
      )
    end

    it 'does not depend on unrelated candles before the source window' do
      full = described_class.new(fixture_candles)
      trimmed = described_class.new(fixture_candles[1..])

      expect(full.window_checksum(start_index: 1, end_index: 2)).to eq(
        trimmed.window_checksum(start_index: 0, end_index: 1)
      )
    end

    it 'precomputes leaf hashes once per candle' do
      allow(described_class).to receive(:leaf_hash).and_call_original

      checksum = described_class.new(fixture_candles)
      checksum.window_checksum(start_index: 1, end_index: 4)
      checksum.window_checksum(start_index: 2, end_index: 4)

      expect(described_class).to have_received(:leaf_hash).exactly(fixture_candles.length).times
    end
  end
end
