# frozen_string_literal: true

class Candle::Syncer
  def initialize(symbol, interval: BitfinexConfig.default_interval, load_all_data: false)
    @symbol = symbol
    @interval = interval
    @load_all_data = load_all_data
  end

  def call
    sync_operation.call
  end

  private

  attr_reader :symbol, :interval, :load_all_data

  def sync_operation
    load_all_data ? backfill_sync : recent_sync
  end

  def recent_sync
    Candle::Sync::Recent.new(
      symbol: symbol,
      interval: interval,
      history_source: history_source,
      importer: importer,
      broadcaster: broadcaster,
      paginator: paginator
    )
  end

  def backfill_sync
    Candle::Sync::Backfill.new(
      symbol: symbol,
      paginator: paginator
    )
  end

  def history_source
    @history_source ||= Candle::Sync::HistorySource.new(symbol: symbol, interval: interval)
  end

  def importer
    @importer ||= Candle::Sync::Importer.new(symbol: symbol)
  end

  def broadcaster
    @broadcaster ||= Candle::Sync::Broadcaster.new(symbol: symbol, interval: interval)
  end

  def aggregate_refresher
    @aggregate_refresher ||= Candle::Sync::AggregateRefresher.new
  end

  def paginator
    @paginator ||= Candle::Sync::Paginator.new(
      history_source: history_source,
      importer: importer,
      broadcaster: broadcaster,
      aggregate_refresher: aggregate_refresher
    )
  end
end
