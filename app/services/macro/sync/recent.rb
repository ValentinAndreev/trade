# frozen_string_literal: true

class Macro::Sync::Recent
  def initialize(entry:, fetcher:, importer:, last_ts: nil)
    @entry = entry
    @fetcher = fetcher
    @importer = importer
    @last_ts = last_ts
  end

  def call
    records = @fetcher.call(from: @last_ts)
    return if records.empty?

    @importer.import(records)
    Rails.logger.info("[macro] synced #{records.size} records for #{@entry.key}")
  end
end
