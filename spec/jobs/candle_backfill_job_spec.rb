# frozen_string_literal: true

require 'rails_helper'

RSpec.describe CandleBackfillJob do
  it 'calls Candle::Syncer with load_all_data for each symbol' do
    fetcher = instance_double(Candle::Syncer, call: nil)

    BitfinexConfig.symbols.each do |sym|
      expect(Candle::Syncer).to receive(:new).with(sym, load_all_data: true).and_return(fetcher)
    end

    described_class.perform_now
  end
end
