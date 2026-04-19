# frozen_string_literal: true

class MacroSeries < ApplicationRecord
  self.primary_key = nil
  self.implicit_order_column = 'ts'

  validates :ts, :source, :indicator, :value, presence: true

  scope :by_source, ->(source) { where(source:) }
  scope :by_indicator, ->(indicator) { where(indicator:) }
  scope :in_range, ->(from, to) { where(ts: from..to) }
  scope :ordered, -> { order(ts: :asc) }

  class << self
    def last_known_at(source:, indicator:)
      where(source:, indicator:).maximum(:ts)
    end

    def batch_last_known_at(entries)
      return {} if entries.empty?

      values_sql = entries.each_index.map { |i| "($#{i * 2 + 1}, $#{i * 2 + 2})" }.join(', ')
      binds = entries.flat_map { |e| [ e.source, e.key ] }
                     .map { |v| ActiveRecord::Relation::QueryAttribute.new(nil, v, ActiveRecord::Type::String.new) }

      connection.exec_query(<<~SQL.squish, 'BatchLastKnownAt', binds).each_with_object({}) do |row, h|
        SELECT source, indicator, MAX(ts) AS ts
        FROM macro_series
        WHERE (source, indicator) IN (VALUES #{values_sql})
        GROUP BY source, indicator
      SQL
        h[[ row['source'], row['indicator'] ]] = row['ts']
      end
    end

    def import(records)
      return [] if records.empty?

      insert_all(
        records,
        unique_by: :index_macro_series_on_source_indicator_ts,
        returning: %w[ts]
      ).rows.flatten
    end
  end
end
