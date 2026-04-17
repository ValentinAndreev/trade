# frozen_string_literal: true

class Candle::Syncer
  def initialize(symbol, interval: BitfinexConfig.default_interval, load_all_data: false)
    @symbol = symbol
    @interval = interval
    @load_all_data = load_all_data
  end

  def call = sync_operation.call

  private

  attr_reader :symbol, :interval, :load_all_data

  def sync_operation = load_all_data ? backfill_sync : recent_sync

  def recent_sync
    Candle::Sync::Recent.new(
      symbol:,
      interval:,
      history_source:,
      importer:,
      broadcaster:,
      paginator:
    )
  end

  def backfill_sync = Candle::Sync::Backfill.new(symbol:, paginator:)

  def history_source
    @history_source ||= Candle::Sync::HistorySource.new(symbol:, interval:)
  end

  def importer
    @importer ||= Candle::Sync::Importer.new(symbol:)
  end

  def broadcaster
    @broadcaster ||= Candle::Sync::Broadcaster.new(symbol:, interval:)
  end

  def aggregate_refresher
    @aggregate_refresher ||= Candle::Sync::AggregateRefresher.new
  end

  def paginator
    @paginator ||= Candle::Sync::Paginator.new(
      history_source:,
      importer:,
      broadcaster:,
      aggregate_refresher:
    )
  end
end
