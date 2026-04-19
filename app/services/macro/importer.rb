# frozen_string_literal: true

class Macro::Importer
  def initialize(source:, indicator:)
    @source = source
    @indicator = indicator
  end

  def import(records)
    return [] if records.empty?

    now = Time.current
    rows = records.map do |r|
      {
        ts: r[:ts],
        source: @source,
        indicator: @indicator,
        value: r[:value],
        created_at: now,
        # updated_at = created_at always: insert_all uses ON CONFLICT DO NOTHING,
        # existing rows are never touched. Column is NOT NULL so must be provided.
        updated_at: now
      }
    end

    MacroSeries.import(rows)
  end
end
