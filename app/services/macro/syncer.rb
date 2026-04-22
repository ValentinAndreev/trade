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
      ->(from:) { yahoo_client.fetch_history(ticker: entry[:ticker], from:) }
    when 'fred'
      ->(from:) { fred_client.fetch_series(series_id: entry[:series_id], from:) }
    when 'alternative_me'
      lambda do |from:|
        return [] if from && from.to_date >= Date.current
        # +2: buffer for today's not-yet-finalized entry + potential UTC offset
        limit = from ? (Date.current - from.to_date).to_i + 2 : 0
        alternative_me_client.fetch_history(limit:)
      end
    when 'coin_metrics'
      metric  = entry[:metric]
      formula = entry[:formula]
      asset   = entry[:asset]
      raise ArgumentError, "coin_metrics entry '#{entry.key}' requires :metric or :formula" if metric.nil? && formula.nil?
      raise ArgumentError, "coin_metrics entry '#{entry.key}' requires :asset" if asset.nil?
      ::Utils::CoinMetricsClient.validate_formula!(formula) if formula

      lambda do |from:|
        if formula
          coin_metrics_client.fetch_derived_series(asset:, formula:, from:)
        else
          coin_metrics_client.fetch_series(asset:, metric:, from:)
        end
      end
    else
      raise ArgumentError, "Unknown macro source: #{entry.source}"
    end
  end

  def yahoo_client = @yahoo_client ||= Utils::YahooFinanceClient.new
  def fred_client = @fred_client ||= Utils::FredClient.new
  def alternative_me_client = @alternative_me_client ||= Utils::AlternativeMeClient.new
  def coin_metrics_client = @coin_metrics_client ||= Utils::CoinMetricsClient.new
end
