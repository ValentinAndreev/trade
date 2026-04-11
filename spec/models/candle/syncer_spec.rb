# frozen_string_literal: true

require 'rails_helper'

RSpec.describe Candle::Syncer do
  describe '#call' do
    it 'delegates the default sync flow to Candle::Sync::Recent' do
      history_source = instance_double(Candle::Sync::HistorySource)
      importer = instance_double(Candle::Sync::Importer)
      broadcaster = instance_double(Candle::Sync::Broadcaster)
      aggregate_refresher = instance_double(Candle::Sync::AggregateRefresher)
      paginator = instance_double(Candle::Sync::Paginator)
      recent = instance_double(Candle::Sync::Recent, call: nil)

      allow(Candle::Sync::HistorySource).to receive(:new).with(symbol: 'BTCUSD', interval: '1m').and_return(history_source)
      allow(Candle::Sync::Importer).to receive(:new).with(symbol: 'BTCUSD').and_return(importer)
      allow(Candle::Sync::Broadcaster).to receive(:new).with(symbol: 'BTCUSD', interval: '1m').and_return(broadcaster)
      allow(Candle::Sync::AggregateRefresher).to receive(:new).and_return(aggregate_refresher)
      allow(Candle::Sync::Paginator).to receive(:new).with(
        history_source: history_source,
        importer: importer,
        broadcaster: broadcaster,
        aggregate_refresher: aggregate_refresher
      ).and_return(paginator)
      allow(Candle::Sync::Recent).to receive(:new).with(
        symbol: 'BTCUSD',
        interval: '1m',
        history_source: history_source,
        importer: importer,
        broadcaster: broadcaster,
        paginator: paginator
      ).and_return(recent)

      described_class.new('BTCUSD').call

      expect(recent).to have_received(:call)
    end

    it 'delegates full-history sync to Candle::Sync::Backfill' do
      history_source = instance_double(Candle::Sync::HistorySource)
      importer = instance_double(Candle::Sync::Importer)
      broadcaster = instance_double(Candle::Sync::Broadcaster)
      aggregate_refresher = instance_double(Candle::Sync::AggregateRefresher)
      paginator = instance_double(Candle::Sync::Paginator)
      backfill = instance_double(Candle::Sync::Backfill, call: nil)

      allow(Candle::Sync::HistorySource).to receive(:new).with(symbol: 'BTCUSD', interval: '5m').and_return(history_source)
      allow(Candle::Sync::Importer).to receive(:new).with(symbol: 'BTCUSD').and_return(importer)
      allow(Candle::Sync::Broadcaster).to receive(:new).with(symbol: 'BTCUSD', interval: '5m').and_return(broadcaster)
      allow(Candle::Sync::AggregateRefresher).to receive(:new).and_return(aggregate_refresher)
      allow(Candle::Sync::Paginator).to receive(:new).with(
        history_source: history_source,
        importer: importer,
        broadcaster: broadcaster,
        aggregate_refresher: aggregate_refresher
      ).and_return(paginator)
      allow(Candle::Sync::Backfill).to receive(:new).with(symbol: 'BTCUSD', paginator: paginator).and_return(backfill)

      described_class.new('BTCUSD', interval: '5m', load_all_data: true).call

      expect(backfill).to have_received(:call)
    end
  end
end
