# frozen_string_literal: true

module Research
  module Dsl
    module ConditionExpression
      class Evaluator
        ARITHMETIC_OPERATIONS = {
          '+' => ->(left, right) { left + right },
          '-' => ->(left, right) { left - right },
          '*' => ->(left, right) { left * right },
          '/' => ->(left, right) { right.zero? ? nil : left / right }
        }.freeze

        CALL_EVALUATORS = {
          'abs' => lambda { |node, resolve:, **|
            value = resolve.call(node[:args].first)
            value&.abs
          },
          'min' => lambda { |node, resolve_arguments:, **|
            values = resolve_arguments.call(node[:args])
            values&.min
          },
          'max' => lambda { |node, resolve_arguments:, **|
            values = resolve_arguments.call(node[:args])
            values&.max
          },
          'prev' => lambda { |node, resolve:, row_offset:, **|
            resolve.call(node[:args].first, row_offset + 1)
          },
          'offset' => lambda { |node, resolve:, row_offset:, **|
            offset = node[:args][1][:value].to_i
            resolve.call(node[:args].first, row_offset + offset)
          }
        }.freeze

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
            return false if node[:op] == '&&' && !left
            return true if node[:op] == '||' && left

            right = evaluate_boolean(node[:right], row:, prev_row:, params:)
            node[:op] == '&&' ? (left && right) : (left || right)
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
          when '<'  then left < right
          when '>'  then left > right
          when '<=' then left <= right
          when '>=' then left >= right
          when '<<'
            return false unless prev_row

            prev_left = resolve_numeric(node[:left], row: prev_row, params:)
            prev_right = resolve_numeric(node[:right], row: prev_row, params:)
            !prev_left.nil? && !prev_right.nil? && prev_left >= prev_right && left < right
          when '>>'
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
          when '-'
            -value
          else
            nil
          end
        end

        def evaluate_arithmetic(node, row:, params:, row_offset:)
          left = resolve_numeric(node[:left], row:, params:, row_offset:)
          right = resolve_numeric(node[:right], row:, params:, row_offset:)
          return nil if left.nil? || right.nil?

          operation = ARITHMETIC_OPERATIONS[node[:op]]
          operation&.call(left, right)
        end

        def evaluate_call(node, row:, params:, row_offset:)
          handler = CALL_EVALUATORS[node[:name]]
          return nil unless handler

          resolve = ->(target_node, target_row_offset = row_offset) { resolve_numeric(target_node, row:, params:, row_offset: target_row_offset) }
          resolve_arguments = lambda { |nodes, target_row_offset = row_offset|
            resolve_numeric_arguments(nodes, row:, params:, row_offset: target_row_offset)
          }

          handler.call(node, resolve:, resolve_arguments:, row_offset:)
        end

        def resolve_numeric_arguments(nodes, row:, params:, row_offset:)
          values = nodes.map { |arg| resolve_numeric(arg, row:, params:, row_offset:) }
          values.any?(&:nil?) ? nil : values
        end
      end
    end
  end
end
