# frozen_string_literal: true

class Macro::FindQuery
  DEFAULT_LOOKBACK = 5.years

  def initialize(indicators:, from: nil, to: nil)
    @indicators = Array(indicators).map(&:to_s)
    @from = parse_time(from)
    @to   = parse_time(to) || Time.current
  end

  def call
    return {} if @indicators.empty?

    rows = @from ? query_with_gapfill : query_raw

    rows.each_with_object({}) do |row, h|
      value = row['value']
      next unless value

      (h[row['indicator']] ||= []) << [ row['bucket'].to_i, value.to_f ]
    end
  end

  private

  def query_with_gapfill
    connection.exec_query(<<-SQL.squish, 'MacroFindQuery', gapfill_bind_params).to_a
      SELECT
        indicator,
        time_bucket_gapfill('1 day', ts) AS bucket,
        locf(last(value, ts)) AS value
      FROM macro_series
      WHERE indicator IN (#{indicators_sql})
        AND ts >= $1
        AND ts <= $2
      GROUP BY indicator, bucket
      ORDER BY indicator, bucket
    SQL
  end

  def query_raw
    connection.exec_query(<<-SQL.squish, 'MacroFindQuery', raw_bind_params).to_a
      SELECT indicator, ts AS bucket, value
      FROM macro_series
      WHERE indicator IN (#{indicators_sql})
        AND ts >= $1
        AND ts <= $2
      ORDER BY indicator, ts
    SQL
  end

  def gapfill_bind_params
    [
      attr(@from.iso8601),
      attr(@to.iso8601)
    ]
  end

  def raw_bind_params
    from = DEFAULT_LOOKBACK.ago
    [ attr(from.iso8601), attr(@to.iso8601) ]
  end

  def attr(value)
    ActiveRecord::Relation::QueryAttribute.new(nil, value, ActiveRecord::Type::String.new)
  end

  def indicators_sql
    @indicators.map { |i| connection.quote(i) }.join(', ')
  end

  def connection
    MacroSeries.connection
  end

  def parse_time(value)
    return if value.nil?
    return value.utc if value.is_a?(Time)

    Time.parse(value.to_s).utc
  rescue ArgumentError, TZInfo::Error
    Rails.logger.warn("[find_query] unparseable time value: #{value.inspect}, falling back to raw query")
  end
end
