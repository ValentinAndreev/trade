# frozen_string_literal: true

class DataTable::Builder
  private attr_reader :candles, :indicator_specs, :change_periods

  def initialize(candles)
    @candles = candles
    @indicator_specs = []
    @change_periods = []
  end

  def with_indicators(specs)
    @indicator_specs = Array(specs).map(&:symbolize_keys)
    self
  end

  def with_changes(periods)
    @change_periods = Array(periods).compact
    self
  end

  def build
    return [] if candles.empty?

    rows = candles.map do |c|
      {
        time: c[:time],
        open: c[:open],
        high: c[:high],
        low: c[:low],
        close: c[:close],
        volume: c[:volume]
      }
    end

    attach_indicators(rows)
    attach_changes(rows)

    rows
  end

  private

  def attach_indicators(rows)
    return if indicator_specs.empty?

    calculator = Candle::IndicatorCalculator.new(candles)

    indicator_specs.each do |spec|
      type = spec[:type].to_sym
      params = (spec[:params] || {}).symbolize_keys
      col_key = indicator_column_key(type, params)

      begin
        results = calculator.calculate(type, **params)
        index_by_time = results.each_with_object({}) do |r, h|
          time = Time.parse(r[:date_time]).to_i
          h[time] = extract_indicator_value(r, type)
        end

        rows.each { |row| row[col_key] = index_by_time[row[:time]] }
      rescue StandardError => e
        Rails.logger.warn("DataTable::Builder indicator #{type} failed: #{e.message}")
        rows.each { |row| row[col_key] = nil }
      end
    end
  end

  def attach_changes(rows)
    return if change_periods.empty?

    close_by_time = rows.each_with_object({}) { |r, h| h[r[:time]] = r[:close] }
    times = rows.map { |r| r[:time] }.sort

    change_periods.each do |period|
      seconds = parse_period_seconds(period)
      col_key = :"change_#{period}"

      rows.each do |row|
        target_time = row[:time] - seconds
        prev_close = find_closest_close(close_by_time, times, target_time)

        row[col_key] = if prev_close && prev_close != 0
          ((row[:close] - prev_close) / prev_close * 100).round(4)
        end
      end
    end
  end

  def indicator_column_key(type, params)
    suffix = params.values.first
    suffix ? :"#{type}_#{suffix}" : type
  end

  COMPOSITE_INDICATORS = %i[macd bb ichimoku sr dc kc kst vi].freeze

  def extract_indicator_value(result, type)
    return result[type] if result.key?(type) && !COMPOSITE_INDICATORS.include?(type)

    case type
    when :macd then result[:macd_line]
    when :bb then result[:middle_band]
    when :ichimoku then result[:tenkan_sen]
    when :sr then result[:support]
    when :dc then result[:dc_upper]
    when :kc then result[:upper_band]
    when :kst then result[:kst]
    when :vi then result[:positive_vi]
    else result.except(:date_time).values.first
    end
  end

  def parse_period_seconds(period)
    match = period.to_s.match(/^(\d+)([mhdw])$/)
    raise ArgumentError, "Invalid period: #{period}" unless match

    amount = match[1].to_i
    case match[2]
    when 'm' then amount * 60
    when 'h' then amount * 3600
    when 'd' then amount * 86400
    when 'w' then amount * 604800
    end
  end

  def find_closest_close(close_by_time, times, target_time)
    return close_by_time[target_time] if close_by_time.key?(target_time)

    idx = times.bsearch_index { |t| t >= target_time }
    return nil unless idx

    candidates = []
    candidates << times[idx] if times[idx]
    candidates << times[idx - 1] if idx > 0

    closest = candidates.min_by { |t| (t - target_time).abs }
    close_by_time[closest]
  end
end
