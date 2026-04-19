# frozen_string_literal: true

class Macro::Sync::Backfill
  def initialize(entry:, fetcher:, importer:)
    @entry = entry
    @fetcher = fetcher
    @importer = importer
  end

  def call
    records = @fetcher.call(from: nil)
    return if records.empty?

    @importer.import(records)
    Rails.logger.info("[macro] backfilled #{records.size} records for #{@entry.key}")
  end
end
