# frozen_string_literal: true

module Research
  module Runtime
    class SignalEvaluator
      def initialize(parsed_conditions, resolver:)
        @evaluators = parsed_conditions.each_with_object({}) do |(key, ast), acc|
          acc[key.to_sym] = Research::Systems::ConditionExpression::Evaluator.new(ast, resolver:)
        end
      end

      def call(name:, prev_row:, row:, params:)
        evaluator = @evaluators[name.to_sym]
        return false unless evaluator

        evaluator.call(row:, prev_row:, params:)
      end
    end
  end
end
