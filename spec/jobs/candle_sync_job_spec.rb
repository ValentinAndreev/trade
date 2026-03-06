# frozen_string_literal: true

require 'rails_helper'

RSpec.describe CandleSyncJob do
  it 'calls Candle::Fetcher for each symbol' do
    BitfinexConfig.symbols.each do |symbol|
      fetcher = instance_double(Candle::Fetcher)
      allow(Candle::Fetcher).to receive(:new).with(symbol).and_return(fetcher)
      allow(fetcher).to receive(:call)
    end

    described_class.perform_now

    BitfinexConfig.symbols.each do |symbol|
      expect(Candle::Fetcher).to have_received(:new).with(symbol)
    end
  end

  it 'continues syncing remaining symbols when one fails' do
    symbols = BitfinexConfig.symbols
    failing_symbol = symbols[1]

    symbols.each do |symbol|
      fetcher = instance_double(Candle::Fetcher)
      allow(Candle::Fetcher).to receive(:new).with(symbol).and_return(fetcher)

      if symbol == failing_symbol
        allow(fetcher).to receive(:call).and_raise(Candle::Fetcher::FetchError, 'boom')
      else
        allow(fetcher).to receive(:call)
      end
    end

    described_class.perform_now

    symbols.each do |symbol|
      expect(Candle::Fetcher).to have_received(:new).with(symbol)
    end
  end
end
