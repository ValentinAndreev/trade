# frozen_string_literal: true

require 'bigdecimal'
require 'digest'
require 'time'

module Ml
  class SourceWindowChecksum
    ROW_PREFIX = "ml-row-v1\0".b.freeze
    NODE_PREFIX = "ml-node-v1\0".b.freeze
    WINDOW_PREFIX = "ml-window-v1\0".b.freeze
    CANONICAL_PREFIX = "ml-candle-v1\0".freeze
    DECIMAL_SCALE = 10
    DECIMAL_FIELDS = %w[close high low open volume].freeze
    CANONICAL_FIELDS = [ *DECIMAL_FIELDS, 'ts' ].sort.freeze

    Node = Data.define(:start_index, :end_index, :hash, :left, :right)
    private_constant :Node

    def self.canonical_row(candle)
      values = {
        'ts' => canonical_timestamp(candle_time(candle))
      }
      DECIMAL_FIELDS.each { |field| values[field] = canonical_decimal(candle_value(candle, field)) }

      "#{CANONICAL_PREFIX}#{CANONICAL_FIELDS.map { |field| "#{field}=#{values.fetch(field)}" }.join("\0")}"
    end

    def self.canonical_decimal(value)
      decimal = BigDecimal(value.to_s).round(DECIMAL_SCALE)
      whole, fraction = decimal.to_s('F').split('.', 2)
      "#{whole}.#{fraction.to_s.ljust(DECIMAL_SCALE, '0')[0, DECIMAL_SCALE]}"
    end

    def self.canonical_timestamp(value)
      value.to_time.utc.iso8601(6)
    end

    def self.leaf_hash(candle)
      Digest::SHA256.digest(ROW_PREFIX + canonical_row(candle).b)
    end

    def self.leaf_hexdigest(candle) = leaf_hash(candle).unpack1('H*')

    def self.node_hash(left_hash, right_hash)
      Digest::SHA256.digest(NODE_PREFIX + left_hash.b + right_hash.b)
    end

    def self.node_hexdigest(left_hash, right_hash) = node_hash(left_hash, right_hash).unpack1('H*')

    def initialize(candles)
      @candles = candles
      @root = build_tree(candles.each_with_index.map { |candle, index| leaf_node(candle, index) })
    end

    def window_checksum(start_index:, end_index:)
      validate_range!(start_index, end_index)

      node_hashes = ordered_covering_hashes(start_index:, end_index:, binary: true)
      start_ts = self.class.canonical_timestamp(candle_time(candles.fetch(start_index)))
      end_ts = self.class.canonical_timestamp(candle_time(candles.fetch(end_index)))
      count = end_index - start_index + 1
      Digest::SHA256.hexdigest(
        WINDOW_PREFIX +
          start_ts.b + "\0".b +
          end_ts.b + "\0".b +
          count.to_s.b + "\0".b +
          node_hashes.join.b
      )
    end

    def ordered_covering_hashes(start_index:, end_index:, binary: false)
      validate_range!(start_index, end_index)

      hashes = covering_nodes(root, start_index, end_index).map(&:hash)
      binary ? hashes : hashes.map { |hash| hash.unpack1('H*') }
    end

    def root_hexdigest
      root&.hash&.unpack1('H*')
    end

    private

    attr_reader :candles, :root

    def self.candle_time(candle)
      if candle.respond_to?(:ts)
        candle.ts
      else
        time_value = candle.fetch(:ts, nil) || candle.fetch('ts', nil) || candle.fetch(:time, nil) || candle.fetch('time')
        time_value.is_a?(Integer) ? Time.at(time_value).utc : time_value
      end
    end
    private_class_method :candle_time

    def self.candle_value(candle, field)
      return candle.public_send(field) if candle.respond_to?(field)

      candle.fetch(field.to_sym, nil) || candle.fetch(field)
    end
    private_class_method :candle_value

    def candle_time(candle) = self.class.send(:candle_time, candle)

    def leaf_node(candle, index)
      Node.new(start_index: index, end_index: index, hash: self.class.leaf_hash(candle), left: nil, right: nil)
    end

    def build_tree(nodes)
      return if nodes.empty?
      return nodes.first if nodes.one?

      parents = nodes.each_slice(2).map do |left, right|
        right ||= left
        Node.new(
          start_index: left.start_index,
          end_index: right.end_index,
          hash: self.class.node_hash(left.hash, right.hash),
          left:,
          right:
        )
      end
      build_tree(parents)
    end

    def covering_nodes(node, start_index, end_index)
      return [] unless node
      return [] if node.end_index < start_index || node.start_index > end_index
      return [ node ] if start_index <= node.start_index && node.end_index <= end_index

      covering_nodes(node.left, start_index, end_index) + covering_nodes(node.right, start_index, end_index)
    end

    def validate_range!(start_index, end_index)
      raise ArgumentError, 'no candles available' if candles.empty?
      raise ArgumentError, 'start_index must be <= end_index' if start_index > end_index
      raise ArgumentError, 'start_index out of range' if start_index.negative?
      raise ArgumentError, 'end_index out of range' if end_index >= candles.length
    end
  end
end
