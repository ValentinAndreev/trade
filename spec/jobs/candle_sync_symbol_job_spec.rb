# frozen_string_literal: true

require 'rails_helper'

RSpec.describe CandleSyncSymbolJob do
  it 'calls Candle::Fetcher for the given symbol' do
    fetcher = instance_double(Candle::Fetcher, call: nil)
    allow(Candle::Fetcher).to receive(:new).with('BTCUSD').and_return(fetcher)

    described_class.perform_now('BTCUSD')
    expect(fetcher).to have_received(:call)
  end
end
