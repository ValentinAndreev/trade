# frozen_string_literal: true

class DataTable::MacroAttachStep
  def self.macro_keys
    MacroConfig.indicator_keys
  end

  def initialize(rows, indicator_specs)
    @rows = rows
    @specs = indicator_specs.select { |s| self.class.macro_keys.include?(s[:type].to_s) }
  end

  def attach
    return if @specs.empty? || @rows.empty?

    indicators = @specs.map { |s| s[:type].to_s }.uniq
    from_ts, to_ts = @rows.minmax_by { |r| r[:time] }.map { |r| r[:time] }
    from_time = Time.at(from_ts).utc
    to_time   = [ Time.at(to_ts).utc, from_time + 1.day ].max

    data = Macro::FindQuery.new(
      indicators:,
      from: from_time,
      to: to_time
    ).call

    indicators.each do |indicator|
      series = (data[indicator] || []).sort_by(&:first)
      next if series.empty?

      col_key = indicator.to_sym
      @rows.each do |row|
        row[col_key] = forward_fill_value(series, row[:time])
      end
    end
  end

  private

  def forward_fill_value(series, ts)
    first_after = series.bsearch_index { |(point_ts, _)| point_ts > ts }
    last_valid = first_after ? first_after - 1 : series.size - 1
    return nil if last_valid < 0

    series[last_valid][1]
  end
end
