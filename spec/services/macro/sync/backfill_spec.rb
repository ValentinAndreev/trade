# frozen_string_literal: true

require 'rails_helper'

RSpec.describe Macro::Sync::Backfill do
  let(:entry) { instance_double(Macro::Catalog::Entry, source: 'yahoo', key: 'dxy') }
  let(:importer) { instance_double(Macro::Importer) }

  describe '#call' do
    context 'when fetcher returns records' do
      let(:records) { [ { ts: Time.utc(2026, 1, 1), value: 100.0 } ] }
      let(:fetcher) { ->(from:) { records } }

      it 'calls fetcher with from: nil' do
        expect(importer).to receive(:import).with(records)
        described_class.new(entry:, fetcher:, importer:).call
      end

      it 'logs backfill count' do
        allow(importer).to receive(:import)
        expect(Rails.logger).to receive(:info).with(/backfilled 1 records for dxy/)
        described_class.new(entry:, fetcher:, importer:).call
      end
    end

    context 'when fetcher returns empty' do
      let(:fetcher) { ->(from:) { [] } }

      it 'does not call importer' do
        expect(importer).not_to receive(:import)
        described_class.new(entry:, fetcher:, importer:).call
      end
    end

    context 'fetcher always receives from: nil' do
      let(:captured) { [] }
      let(:fetcher) { ->(from:) { captured << from; [] } }

      it 'passes nil to fetcher' do
        described_class.new(entry:, fetcher:, importer:).call
        expect(captured.first).to be_nil
      end
    end
  end
end
