# frozen_string_literal: true

module Research
  # Holds one pre-built Evaluator per condition and re-uses them across rows,
  # eliminating per-row object allocations in the hot simulate() loop.
  class SignalEvaluator
    def initialize(parsed_conditions, resolver:)
      @evaluators = parsed_conditions.transform_values do |ast|
        Dsl::ConditionExpression::Evaluator.new(ast, resolver: resolver)
      end
    end

    def call(prev_row:, row:, params:)
      @evaluators.each_with_object({}) do |(key, ev), acc|
        acc[key.to_sym] = ev.call(row: row, prev_row: prev_row, params: params)
      end
    end
  end
end
