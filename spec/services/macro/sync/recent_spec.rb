# frozen_string_literal: true

require 'rails_helper'

RSpec.describe Macro::Sync::Recent do
  let(:entry) { instance_double(Macro::Catalog::Entry, source: 'yahoo', key: 'dxy') }
  let(:importer) { instance_double(Macro::Importer) }

  describe '#call' do
    context 'when fetcher returns records' do
      let(:records) { [ { ts: Time.utc(2026, 1, 1), value: 100.0 } ] }
      let(:fetcher) { ->(from:) { records } }

      it 'imports and logs' do
        expect(importer).to receive(:import).with(records)
        expect(Rails.logger).to receive(:info).with(/synced 1 records for dxy/)
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

    context 'when last_ts is provided' do
      let(:last_ts) { Time.utc(2026, 1, 5) }
      let(:captured) { [] }
      let(:fetcher) { ->(from:) { captured << from; [] } }

      it 'passes last_ts to fetcher' do
        described_class.new(entry:, fetcher:, importer:, last_ts:).call
        expect(captured.first).to eq(last_ts)
      end
    end

    context 'when no last_ts' do
      let(:captured) { [] }
      let(:fetcher) { ->(from:) { captured << from; [] } }

      it 'calls fetcher with from: nil' do
        described_class.new(entry:, fetcher:, importer:).call
        expect(captured.first).to be_nil
      end
    end
  end
end
