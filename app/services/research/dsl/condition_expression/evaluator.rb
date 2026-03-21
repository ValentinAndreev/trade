# frozen_string_literal: true

module Research
  module Dsl
    module ConditionExpression
      class Evaluator
        def initialize(ast, resolver:)
          @ast = ast
          @resolver = resolver
        end

        def call(row:, prev_row:, params:)
          evaluate_boolean(@ast, row:, prev_row:, params:)
        end

        private

        attr_reader :ast, :resolver

        def evaluate_boolean(node, row:, prev_row:, params:)
          case node[:type]
          when :group
            evaluate_boolean(node[:expression], row:, prev_row:, params:)
          when :logical
            left = evaluate_boolean(node[:left], row:, prev_row:, params:)
            return false if node[:op] == "&&" && !left
            return true if node[:op] == "||" && left

            right = evaluate_boolean(node[:right], row:, prev_row:, params:)
            node[:op] == "&&" ? (left && right) : (left || right)
          when :compare
            evaluate_comparison(node, row:, prev_row:, params:)
          else
            false
          end
        end

        def evaluate_comparison(node, row:, prev_row:, params:)
          left = resolve_numeric(node[:left], row:, params:)
          right = resolve_numeric(node[:right], row:, params:)
          return false if left.nil? || right.nil?

          case node[:op]
          when "<"  then left < right
          when ">"  then left > right
          when "<=" then left <= right
          when ">=" then left >= right
          when "<<"
            return false unless prev_row

            prev_left = resolve_numeric(node[:left], row: prev_row, params:)
            prev_right = resolve_numeric(node[:right], row: prev_row, params:)
            !prev_left.nil? && !prev_right.nil? && prev_left >= prev_right && left < right
          when ">>"
            return false unless prev_row

            prev_left = resolve_numeric(node[:left], row: prev_row, params:)
            prev_right = resolve_numeric(node[:right], row: prev_row, params:)
            !prev_left.nil? && !prev_right.nil? && prev_left <= prev_right && left > right
          else
            false
          end
        end

        def resolve_numeric(node, row:, params:, row_offset: 0)
          case node[:type]
          when :group
            resolve_numeric(node[:expression], row:, params:, row_offset:)
          when :unary
            evaluate_unary(node, row:, params:, row_offset:)
          when :arithmetic
            evaluate_arithmetic(node, row:, params:, row_offset:)
          when :call
            evaluate_call(node, row:, params:, row_offset:)
          when :number
            node[:value]
          when :reference
            resolver.call(node[:value], row:, params:, row_offset:)
          else
            nil
          end
        end

        def evaluate_unary(node, row:, params:, row_offset:)
          value = resolve_numeric(node[:expression], row:, params:, row_offset:)
          return nil if value.nil?

          case node[:op]
          when "-"
            -value
          else
            nil
          end
        end

        def evaluate_arithmetic(node, row:, params:, row_offset:)
          left = resolve_numeric(node[:left], row:, params:, row_offset:)
          right = resolve_numeric(node[:right], row:, params:, row_offset:)
          return nil if left.nil? || right.nil?

          case node[:op]
          when "+"
            left + right
          when "-"
            left - right
          when "*"
            left * right
          when "/"
            return nil if right.zero?

            left / right
          else
            nil
          end
        end

        def evaluate_call(node, row:, params:, row_offset:)
          case node[:name]
          when "abs"
            value = resolve_numeric(node[:args][0], row:, params:, row_offset:)
            value&.abs
          when "min"
            values = node[:args].map { |arg| resolve_numeric(arg, row:, params:, row_offset:) }
            values.any?(&:nil?) ? nil : values.min
          when "max"
            values = node[:args].map { |arg| resolve_numeric(arg, row:, params:, row_offset:) }
            values.any?(&:nil?) ? nil : values.max
          when "prev"
            resolve_numeric(node[:args][0], row:, params:, row_offset: row_offset + 1)
          when "offset"
            offset = node[:args][1][:value].to_i
            resolve_numeric(node[:args][0], row:, params:, row_offset: row_offset + offset)
          else
            nil
          end
        end
      end
    end
  end
end
