# frozen_string_literal: true

require 'rails_helper'

RSpec.describe Macro::FindQuery do
  let(:base_time) { Time.utc(2026, 1, 1) }

  before do
    # 5 daily records for dxy, 3 for vix
    5.times do |i|
      create(:macro_series, indicator: 'dxy', source: 'yahoo', ts: base_time + i.days, value: 100.0 + i)
    end
    3.times do |i|
      create(:macro_series, indicator: 'vix', source: 'yahoo', ts: base_time + i.days, value: 20.0 + i)
    end
  end

  describe '#call without from (raw path)' do
    it 'returns data for requested indicators' do
      result = described_class.new(indicators: %w[dxy], to: base_time + 10.days).call
      expect(result).to have_key('dxy')
      expect(result['dxy'].length).to eq(5)
    end

    it 'returns multiple indicators' do
      result = described_class.new(indicators: %w[dxy vix], to: base_time + 10.days).call
      expect(result.keys).to match_array(%w[dxy vix])
    end

    it 'returns empty hash for unknown indicator' do
      result = described_class.new(indicators: %w[unknown], to: base_time + 10.days).call
      expect(result).to eq({})
    end

    it 'returns [] for empty indicators' do
      result = described_class.new(indicators: [], to: base_time + 10.days).call
      expect(result).to eq({})
    end

    it 'each point is [unix_ts, float]' do
      result = described_class.new(indicators: %w[dxy], to: base_time + 10.days).call
      point = result['dxy'].first
      expect(point[0]).to be_an(Integer)
      expect(point[1]).to be_a(Float)
    end
  end

  describe '#call with from (gapfill path)', :timescale do
    it 'returns gapfilled data across the range' do
      result = described_class.new(
        indicators: %w[dxy],
        from: base_time,
        to: base_time + 6.days
      ).call

      expect(result).to have_key('dxy')
      # 7 buckets (day 0..6): 5 real + 2 forward-filled
      expect(result['dxy'].length).to eq(7)
    end

    it 'forward-fills the last known value into gaps' do
      result = described_class.new(
        indicators: %w[dxy],
        from: base_time,
        to: base_time + 6.days
      ).call

      points = result['dxy']
      last_real_value = 100.0 + 4  # day index 4
      expect(points.last[1]).to eq(last_real_value)
      expect(points[-2][1]).to eq(last_real_value)
    end
  end

  describe 'time parsing' do
    it 'accepts Time objects for from/to' do
      expect {
        described_class.new(indicators: %w[dxy], from: base_time, to: base_time + 5.days).call
      }.not_to raise_error
    end

    it 'accepts ISO8601 strings for from/to' do
      expect {
        described_class.new(
          indicators: %w[dxy],
          from: base_time.iso8601,
          to: (base_time + 5.days).iso8601
        ).call
      }.not_to raise_error
    end

    it 'ignores garbage from value and falls back to raw query' do
      expect {
        described_class.new(indicators: %w[dxy], from: 'not-a-date').call
      }.not_to raise_error
    end
  end
end
