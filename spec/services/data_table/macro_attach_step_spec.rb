# frozen_string_literal: true

require 'rails_helper'

RSpec.describe DataTable::MacroAttachStep do
  let(:base_ts) { Time.utc(2026, 1, 10).to_i }

  def row(offset_hours)
    { time: base_ts + offset_hours * 3600, open: 1.0, close: 1.0, high: 1.0, low: 1.0, volume: 1.0 }
  end

  describe '#attach' do
    it 'does nothing when no macro specs present' do
      rows = [ row(0) ]
      described_class.new(rows, [ { type: 'ema', params: { period: 20 } } ]).attach
      expect(rows.first).not_to have_key(:dxy)
    end

    it 'does nothing when rows empty' do
      expect {
        described_class.new([], [ { type: 'dxy' } ]).attach
      }.not_to raise_error
    end

    context 'with macro data in DB' do
      before do
        create(:macro_series, indicator: 'dxy', source: 'yahoo',
               ts: Time.utc(2026, 1, 9), value: 99.0)
        create(:macro_series, indicator: 'dxy', source: 'yahoo',
               ts: Time.utc(2026, 1, 10), value: 101.0)
      end

      it 'attaches forward-filled value to each row' do
        rows = [ row(0), row(12), row(36) ]
        described_class.new(rows, [ { type: 'dxy' } ]).attach

        expect(rows[0][:dxy]).to be_a(Float)
        # row(36) = Jan 11 12:00 → locf of Jan 10 value
        expect(rows[2][:dxy]).to eq(rows[1][:dxy])
      end

      it 'leaves nil for rows before any known data' do
        rows = [ { time: Time.utc(2026, 1, 1).to_i, open: 1.0, close: 1.0, high: 1.0, low: 1.0, volume: 1.0 } ]
        described_class.new(rows, [ { type: 'dxy' } ]).attach
        expect(rows.first[:dxy]).to be_nil
      end

      it 'returns last known value for rows after all data points' do
        far_future = { time: Time.utc(2026, 3, 1).to_i, open: 1.0, close: 1.0, high: 1.0, low: 1.0, volume: 1.0 }
        rows = [ far_future ]
        described_class.new(rows, [ { type: 'dxy' } ]).attach
        expect(rows.first[:dxy]).to eq(101.0)
      end

      it 'returns value at exact timestamp match' do
        rows = [ { time: Time.utc(2026, 1, 10).to_i, open: 1.0, close: 1.0, high: 1.0, low: 1.0, volume: 1.0 } ]
        described_class.new(rows, [ { type: 'dxy' } ]).attach
        expect(rows.first[:dxy]).to eq(101.0)
      end
    end
  end
end
