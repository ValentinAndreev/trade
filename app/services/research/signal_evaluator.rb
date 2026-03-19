# frozen_string_literal: true

module Research
  # Holds one pre-built Evaluator per condition and re-uses them across rows,
  # eliminating per-row object allocations in the hot simulate() loop.
  class SignalEvaluator
    def initialize(parsed_conditions, resolver:)
      @evaluators = parsed_conditions.each_with_object({}) do |(key, ast), acc|
        acc[key.to_sym] = Dsl::ConditionExpression::Evaluator.new(ast, resolver: resolver)
      end
    end

    def call(name:, prev_row:, row:, params:)
      evaluator = @evaluators[name.to_sym]
      return false unless evaluator

      evaluator.call(row: row, prev_row: prev_row, params: params)
    end
  end
end
