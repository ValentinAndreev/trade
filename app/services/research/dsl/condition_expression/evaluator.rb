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
            prev_left && prev_right && prev_left >= prev_right && left < right
          when ">>"
            return false unless prev_row

            prev_left = resolve_numeric(node[:left], row: prev_row, params:)
            prev_right = resolve_numeric(node[:right], row: prev_row, params:)
            prev_left && prev_right && prev_left <= prev_right && left > right
          else
            false
          end
        end

        def resolve_numeric(node, row:, params:)
          case node[:type]
          when :group
            resolve_numeric(node[:expression], row:, params:)
          when :number
            node[:value]
          when :reference
            resolver.call(node[:value], row:, params:)
          else
            nil
          end
        end
      end
    end
  end
end
