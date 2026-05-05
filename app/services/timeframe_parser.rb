# frozen_string_literal: true

class TimeframeParser
  Parsed = Data.define(:amount, :unit, :interval_unit, :duration_seconds)

  UNITS = {
    'm' => { interval_unit: 'minutes', duration_seconds: 60 },
    'h' => { interval_unit: 'hours', duration_seconds: 3_600 },
    'd' => { interval_unit: 'days', duration_seconds: 86_400 },
    'w' => { interval_unit: 'weeks', duration_seconds: 604_800 }
  }.freeze

  def self.parse(value)
    match = value.to_s.match(/\A(\d+)([mhdw])\z/)
    raise ArgumentError, "Invalid timeframe format: #{value}" unless match

    unit = match[2]
    metadata = UNITS.fetch(unit)
    amount = match[1].to_i
    raise ArgumentError, "Invalid timeframe format: #{value}" unless amount.positive?

    Parsed.new(
      amount:,
      unit:,
      interval_unit: metadata.fetch(:interval_unit),
      duration_seconds: amount * metadata.fetch(:duration_seconds)
    )
  end

  def self.duration_seconds(value) = parse(value).duration_seconds
end
