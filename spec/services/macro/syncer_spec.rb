# frozen_string_literal: true

require 'rails_helper'

RSpec.describe Macro::Syncer do
  let(:entry) do
    instance_double(Macro::Catalog::Entry,
      source: 'yahoo', key: 'dxy', ticker: 'DX-Y.NYB')
  end

  describe '#call' do
    it 'continues when an entry raises and logs the error' do
      allow(MacroSeries).to receive(:batch_last_known_at).and_return({})
      allow_any_instance_of(Utils::YahooFinanceClient).to receive(:fetch_history).and_raise(StandardError, 'timeout')

      expect(Rails.logger).to receive(:error).with(/dxy.*timeout/)
      expect { described_class.new.call([ entry ]) }.not_to raise_error
    end

    context 'with backfill: false' do
      it 'calls batch_last_known_at once for all entries' do
        expect(MacroSeries).to receive(:batch_last_known_at).once.and_return({})
        allow_any_instance_of(Utils::YahooFinanceClient).to receive(:fetch_history).and_return([])

        described_class.new(backfill: false).call([ entry ])
      end
    end

    context 'with backfill: true' do
      it 'skips batch timestamp query' do
        expect(MacroSeries).not_to receive(:batch_last_known_at)
        allow_any_instance_of(Utils::YahooFinanceClient).to receive(:fetch_history).and_return([])

        described_class.new(backfill: true).call([ entry ])
      end
    end

    it 'raises for unknown source' do
      bad_entry = instance_double(Macro::Catalog::Entry, source: 'unknown', key: 'x')
      allow(MacroSeries).to receive(:batch_last_known_at).and_return({})

      expect(Rails.logger).to receive(:error).with(/x.*Unknown macro source/)
      described_class.new.call([ bad_entry ])
    end
  end
end
