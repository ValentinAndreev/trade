# frozen_string_literal: true

require 'enumerable/statistics'

class DataTable::Statistics
  private attr_reader :values

  def initialize(values) = @values = values.compact.map(&:to_f)

  def calculate
    return {} if values.empty?

    sorted = values.sort

    {
      count: values.length,
      sum: values.sum,
      mean: values.mean,
      median: values.median,
      std_dev: values.stdev,
      variance: values.variance,
      min: sorted.first,
      max: sorted.last,
      range: sorted.last - sorted.first,
      p25: values.percentile(25),
      p75: values.percentile(75),
      p90: values.percentile(90),
      p95: values.percentile(95)
    }
  end

  def self.from_rows(rows, field)
    vals = rows.map { |r| row_value(r, field) }
    new(vals).calculate
  end

  def self.correlation_matrix(rows, fields)
    fields.combination(2).each_with_object({}) do |(a, b), matrix|
      vals_a = rows.map { |r| row_value(r, a) }.compact.map(&:to_f)
      vals_b = rows.map { |r| row_value(r, b) }.compact.map(&:to_f)
      n = [ vals_a.length, vals_b.length ].min
      next if n < 2

      corr = DataTable::CorrelationCalculator.new(vals_a.first(n), vals_b.first(n)).calculate
      matrix["#{a}:#{b}"] = corr
    end
  end

  def self.row_value(row, field) = row[field.to_sym] || row[field.to_s]
  private_class_method :row_value
end
