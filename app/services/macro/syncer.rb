# frozen_string_literal: true

class Macro::Syncer
  def initialize(backfill: false)
    @backfill = backfill
  end

  def call(entries)
    entries = Array(entries)
    timestamps = fetch_timestamps(entries)

    entries.each do |entry|
      sync_entry(entry, timestamps[[ entry.source, entry.key ]])
    rescue StandardError => e
      Rails.logger.error("[macro] #{entry.key} failed: #{e.message}")
    end
  end

  private

  def fetch_timestamps(entries)
    return {} if @backfill

    MacroSeries.batch_last_known_at(entries)
  end

  def sync_entry(entry, last_ts)
    fetcher = build_fetcher(entry)
    importer = Macro::Importer.new(source: entry.source, indicator: entry.key)

    if @backfill
      Macro::Sync::Backfill.new(entry:, fetcher:, importer:).call
    else
      Macro::Sync::Recent.new(entry:, fetcher:, importer:, last_ts:).call
    end
  end

  def build_fetcher(entry)
    case entry.source
    when 'yahoo'
      yahoo = @yahoo ||= Utils::YahooFinanceClient.new
      ->(from:) { yahoo.fetch_history(ticker: entry.ticker, from:) }
    when 'fred'
      fred = @fred ||= Utils::FredClient.new
      ->(from:) { fred.fetch_series(series_id: entry.series_id, from:) }
    when 'alternative_me'
      alt = @alt ||= Utils::AlternativeMeClient.new
      lambda do |from:|
        return [] if from && from.to_date >= Date.current
        # +2: buffer for today's not-yet-finalized entry + potential UTC offset
        limit = from ? (Date.current - from.to_date).to_i + 2 : 0
        alt.fetch_history(limit:)
      end
    else
      raise ArgumentError, "Unknown macro source: #{entry.source}"
    end
  end
end
