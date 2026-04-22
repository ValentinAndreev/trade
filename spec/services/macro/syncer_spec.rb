# frozen_string_literal: true

require 'rails_helper'

RSpec.describe Macro::Syncer do
  let(:entry) do
    instance_double(Macro::Catalog::Entry,
      source: 'yahoo', key: 'dxy')
  end
  let(:syncer) { described_class.new }

  describe '#call' do
    it 'continues when an entry raises and logs the error' do
      yahoo_client = instance_double(Utils::YahooFinanceClient)
      allow(MacroSeries).to receive(:batch_last_known_at).and_return({})
      allow(syncer).to receive(:yahoo_client).and_return(yahoo_client)
      allow(entry).to receive(:[]).with(:ticker).and_return('DX-Y.NYB')
      allow(yahoo_client).to receive(:fetch_history).and_raise(StandardError, 'timeout')

      expect(Rails.logger).to receive(:error).with(/dxy.*timeout/)
      expect { syncer.call([ entry ]) }.not_to raise_error
    end

    context 'with backfill: false' do
      it 'calls batch_last_known_at once for all entries' do
        yahoo_client = instance_double(Utils::YahooFinanceClient)
        expect(MacroSeries).to receive(:batch_last_known_at).once.and_return({})
        allow(syncer).to receive(:yahoo_client).and_return(yahoo_client)
        allow(entry).to receive(:[]).with(:ticker).and_return('DX-Y.NYB')
        allow(yahoo_client).to receive(:fetch_history).and_return([])

        syncer.call([ entry ])
      end
    end

    context 'with backfill: true' do
      it 'skips batch timestamp query' do
        syncer = described_class.new(backfill: true)
        yahoo_client = instance_double(Utils::YahooFinanceClient)
        expect(MacroSeries).not_to receive(:batch_last_known_at)
        allow(syncer).to receive(:yahoo_client).and_return(yahoo_client)
        allow(entry).to receive(:[]).with(:ticker).and_return('DX-Y.NYB')
        allow(yahoo_client).to receive(:fetch_history).and_return([])

        syncer.call([ entry ])
      end
    end

    it 'raises for unknown source' do
      bad_entry = instance_double(Macro::Catalog::Entry, source: 'unknown', key: 'x')
      allow(MacroSeries).to receive(:batch_last_known_at).and_return({})

      expect(Rails.logger).to receive(:error).with(/x.*Unknown macro source/)
      described_class.new.call([ bad_entry ])
    end

    it 'logs an error for a coin_metrics entry with neither metric nor formula' do
      bad_entry = instance_double(Macro::Catalog::Entry, source: 'coin_metrics', key: 'broken')
      allow(MacroSeries).to receive(:batch_last_known_at).and_return({})
      allow(bad_entry).to receive(:[]).with(:metric).and_return(nil)
      allow(bad_entry).to receive(:[]).with(:formula).and_return(nil)
      allow(bad_entry).to receive(:[]).with(:asset).and_return(nil)

      expect(Rails.logger).to receive(:error).with(/broken.*requires :metric or :formula/)
      described_class.new.call([ bad_entry ])
    end

    it 'logs an error for a coin_metrics entry with an unknown formula' do
      bad_entry = instance_double(Macro::Catalog::Entry, source: 'coin_metrics', key: 'broken')
      allow(MacroSeries).to receive(:batch_last_known_at).and_return({})
      allow(bad_entry).to receive(:[]).with(:metric).and_return(nil)
      allow(bad_entry).to receive(:[]).with(:formula).and_return('nonexistent_formula')
      allow(bad_entry).to receive(:[]).with(:asset).and_return('btc')

      expect(Rails.logger).to receive(:error).with(/Unknown Coin Metrics formula.*nonexistent_formula/)
      described_class.new.call([ bad_entry ])
    end

    it 'logs an error for a coin_metrics entry without an asset' do
      bad_entry = instance_double(Macro::Catalog::Entry, source: 'coin_metrics', key: 'broken')
      allow(MacroSeries).to receive(:batch_last_known_at).and_return({})
      allow(bad_entry).to receive(:[]).with(:metric).and_return('CapMVRVCur')
      allow(bad_entry).to receive(:[]).with(:formula).and_return(nil)
      allow(bad_entry).to receive(:[]).with(:asset).and_return(nil)

      expect(Rails.logger).to receive(:error).with(/broken.*requires :asset/)
      described_class.new.call([ bad_entry ])
    end

    it 'fetches direct Coin Metrics series' do
      entry = instance_double(Macro::Catalog::Entry,
        source: 'coin_metrics',
        key: 'mvrv_ratio')
      client = instance_double(Utils::CoinMetricsClient)
      importer = instance_double(Macro::Importer)
      allow(MacroSeries).to receive(:batch_last_known_at).and_return({})
      allow(syncer).to receive(:coin_metrics_client).and_return(client)
      allow(entry).to receive(:[]).with(:formula).and_return(nil)
      allow(entry).to receive(:[]).with(:asset).and_return('btc')
      allow(entry).to receive(:[]).with(:metric).and_return('CapMVRVCur')
      allow(client).to receive(:fetch_series)
        .with(asset: 'btc', metric: 'CapMVRVCur', from: nil)
        .and_return([ { ts: Time.utc(2026, 4, 1), value: 1.02 } ])
      allow(Macro::Importer).to receive(:new)
        .with(source: 'coin_metrics', indicator: 'mvrv_ratio')
        .and_return(importer)

      expect(importer).to receive(:import).with([ { ts: Time.utc(2026, 4, 1), value: 1.02 } ])

      syncer.call([ entry ])
    end

    it 'fetches derived Coin Metrics series' do
      entry = instance_double(Macro::Catalog::Entry,
        source: 'coin_metrics',
        key: 'mvrv_z_score')
      client = instance_double(Utils::CoinMetricsClient)
      importer = instance_double(Macro::Importer)
      allow(MacroSeries).to receive(:batch_last_known_at).and_return({})
      allow(syncer).to receive(:coin_metrics_client).and_return(client)
      allow(entry).to receive(:[]).with(:metric).and_return(nil)
      allow(entry).to receive(:[]).with(:formula).and_return('mvrv_z_score')
      allow(entry).to receive(:[]).with(:asset).and_return('btc')
      allow(client).to receive(:fetch_derived_series)
        .with(asset: 'btc', formula: 'mvrv_z_score', from: nil)
        .and_return([ { ts: Time.utc(2026, 4, 1), value: 2.0 } ])
      allow(Macro::Importer).to receive(:new)
        .with(source: 'coin_metrics', indicator: 'mvrv_z_score')
        .and_return(importer)

      expect(importer).to receive(:import).with([ { ts: Time.utc(2026, 4, 1), value: 2.0 } ])

      syncer.call([ entry ])
    end
  end
end
