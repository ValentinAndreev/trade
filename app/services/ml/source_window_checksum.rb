# frozen_string_literal: true

require 'bigdecimal'
require 'digest'
require 'time'

module Ml
  class SourceWindowChecksum
    ROW_PREFIX = "ml-row-v1\0".b.freeze
    WINDOW_PREFIX = "ml-window-v1\0".b.freeze
    CANONICAL_PREFIX = "ml-candle-v1\0".freeze
    DECIMAL_SCALE = 10
    DECIMAL_FIELDS = %w[close high low open volume].freeze
    CANONICAL_FIELDS = [ *DECIMAL_FIELDS, 'ts' ].sort.freeze

    def self.canonical_row(candle)
      values = {
        'ts' => canonical_timestamp(candle_time(candle))
      }
      DECIMAL_FIELDS.each { |field| values[field] = canonical_decimal(candle_value(candle, field)) }

      "#{CANONICAL_PREFIX}#{CANONICAL_FIELDS.map { |field| "#{field}=#{values.fetch(field)}" }.join("\0")}"
    end

    def self.canonical_decimal(value)
      raise ArgumentError, 'candle decimal value is missing' if value.nil? || value.to_s.blank?

      decimal = BigDecimal(value.to_s).round(DECIMAL_SCALE)
      whole, fraction = decimal.to_s('F').split('.', 2)
      fraction ||= ''
      "#{whole}.#{fraction.ljust(DECIMAL_SCALE, '0')[0, DECIMAL_SCALE]}"
    end

    def self.canonical_timestamp(value)
      value.to_time.utc.iso8601(6)
    end

    def self.canonical_timestamp_for(candle)
      canonical_timestamp(candle_time(candle))
    end

    def self.leaf_hash(candle)
      Digest::SHA256.digest(ROW_PREFIX + canonical_row(candle).b)
    end

    def self.leaf_hexdigest(candle) = leaf_hash(candle).unpack1('H*')

    def initialize(candles)
      @candles = candles
      @leaf_hashes = candles.map { |candle| SourceWindowChecksum.leaf_hash(candle) }
      @canonical_timestamps = candles.map { |candle| SourceWindowChecksum.canonical_timestamp_for(candle) }
    end

    def window_checksum(start_index:, end_index:)
      validate_range!(start_index, end_index)

      window_hashes = leaf_hashes[start_index..end_index]
      start_ts = canonical_timestamps.fetch(start_index)
      end_ts = canonical_timestamps.fetch(end_index)
      count = end_index - start_index + 1
      Digest::SHA256.hexdigest(
        WINDOW_PREFIX +
          start_ts.b + "\0".b +
          end_ts.b + "\0".b +
          count.to_s.b + "\0".b +
          window_hashes.join.b
      )
    end

    private

    attr_reader :candles, :leaf_hashes, :canonical_timestamps

    def self.candle_time(candle)
      case candle
      when Candle
        candle.ts
      else
        time_value = candle.fetch(:ts, nil) || candle.fetch('ts', nil) || candle.fetch(:time, nil) || candle.fetch('time')
        time_value.is_a?(Integer) ? Time.at(time_value).utc : time_value
      end
    end

    def self.candle_value(candle, field)
      return candle.public_send(field) if candle.is_a?(Candle)

      candle.fetch(field.to_sym, nil) || candle.fetch(field)
    end
    private_class_method :candle_time, :candle_value

    def validate_range!(start_index, end_index)
      raise ArgumentError, 'no candles available' if candles.empty?
      raise ArgumentError, 'start_index must be <= end_index' if start_index > end_index
      raise ArgumentError, 'start_index out of range' if start_index.negative?
      raise ArgumentError, 'end_index out of range' if end_index >= candles.length
    end
  end
end
