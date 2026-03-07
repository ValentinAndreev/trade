# frozen_string_literal: true

class DataTable::CorrelationCalculator
  private attr_reader :series_a, :series_b

  def initialize(series_a, series_b)
    @series_a = series_a.map(&:to_f)
    @series_b = series_b.map(&:to_f)
  end

  def calculate
    n = [ series_a.length, series_b.length ].min
    return nil if n < 2

    a = series_a.first(n)
    b = series_b.first(n)

    mean_a = a.sum / n
    mean_b = b.sum / n

    cov = 0.0
    var_a = 0.0
    var_b = 0.0

    n.times do |i|
      da = a[i] - mean_a
      db = b[i] - mean_b
      cov += da * db
      var_a += da * da
      var_b += db * db
    end

    denominator = Math.sqrt(var_a * var_b)
    return nil if denominator.zero?

    (cov / denominator).round(6)
  end

  def self.from_candles(candles_a, candles_b, field: :close)
    a_vals = candles_a.map { |c| c[field] }
    b_vals = candles_b.map { |c| c[field] }
    new(a_vals, b_vals).calculate
  end
end
