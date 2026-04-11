# frozen_string_literal: true

require 'rails_helper'

RSpec.describe CandleSyncSymbolJob do
  it 'calls Candle::Syncer for the given symbol' do
    fetcher = instance_double(Candle::Syncer, call: nil)
    allow(Candle::Syncer).to receive(:new).with('BTCUSD').and_return(fetcher)

    described_class.perform_now('BTCUSD')
    expect(fetcher).to have_received(:call)
  end
end
