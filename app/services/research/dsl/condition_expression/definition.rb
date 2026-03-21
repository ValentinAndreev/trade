# frozen_string_literal: true

module Research
  module Dsl
    module ConditionExpression
      module Definition
        ROOT_REQUIREMENT = 'Condition expressions must evaluate to a boolean comparison'
        MODULE_OUTPUT_REFERENCE = '<module>.value'
        PARAMS_REFERENCE = 'params.<key>'

        OPERATORS = [
          { symbol: "&&", category: :logical, label: 'Logical and', precedence: 2, register_in_frontend_parser: false },
          { symbol: "||", category: :logical, label: 'Logical or', precedence: 1, register_in_frontend_parser: false },
          { symbol: "<<", category: :comparison, label: 'Cross below', precedence: 6, register_in_frontend_parser: true },
          { symbol: ">>", category: :comparison, label: 'Cross above', precedence: 6, register_in_frontend_parser: true },
          { symbol: "<", category: :comparison, label: 'Less than', precedence: 6, register_in_frontend_parser: false },
          { symbol: ">", category: :comparison, label: 'Greater than', precedence: 6, register_in_frontend_parser: false },
          { symbol: "<=", category: :comparison, label: 'Less or equal', precedence: 6, register_in_frontend_parser: false },
          { symbol: ">=", category: :comparison, label: 'Greater or equal', precedence: 6, register_in_frontend_parser: false },
          { symbol: "+", category: :arithmetic, label: 'Addition', precedence: 9, register_in_frontend_parser: false },
          { symbol: "-", category: :arithmetic, label: 'Subtraction', precedence: 9, register_in_frontend_parser: false },
          { symbol: "*", category: :arithmetic, label: 'Multiplication', precedence: 10, register_in_frontend_parser: false },
          { symbol: "/", category: :arithmetic, label: 'Division', precedence: 10, register_in_frontend_parser: false }
        ].freeze

        FUNCTIONS = [
          {
            name: 'abs',
            label: 'Absolute value',
            signature: 'abs(x)',
            description: 'Absolute value',
            min_args: 1,
            max_args: 1,
            return_kind: :numeric,
            numeric_arguments: true,
            positive_integer_literal_indexes: []
          },
          {
            name: 'min',
            label: 'Minimum',
            signature: 'min(a, b, ...)',
            description: 'Smallest value',
            min_args: 2,
            max_args: nil,
            return_kind: :numeric,
            numeric_arguments: true,
            positive_integer_literal_indexes: []
          },
          {
            name: 'max',
            label: 'Maximum',
            signature: 'max(a, b, ...)',
            description: 'Largest value',
            min_args: 2,
            max_args: nil,
            return_kind: :numeric,
            numeric_arguments: true,
            positive_integer_literal_indexes: []
          },
          {
            name: 'prev',
            label: 'Previous bar value',
            signature: 'prev(x)',
            description: 'Value from 1 bar ago',
            min_args: 1,
            max_args: 1,
            return_kind: :numeric,
            numeric_arguments: true,
            positive_integer_literal_indexes: []
          },
          {
            name: 'offset',
            label: 'Value N bars back',
            signature: 'offset(x, n)',
            description: 'Value from n bars ago',
            min_args: 2,
            max_args: 2,
            return_kind: :numeric,
            numeric_arguments: true,
            positive_integer_literal_indexes: [ 1 ]
          }
        ].freeze

        class << self
          def binary_operator_symbols
            @binary_operator_symbols ||= OPERATORS.map { |operator| operator.fetch(:symbol) }.freeze
          end

          def function_names
            @function_names ||= FUNCTIONS.map { |function| function.fetch(:name) }.freeze
          end

          def function_definition(name)
            FUNCTIONS.find { |function| function.fetch(:name) == name.to_s }
          end

          def highlight_fragment
            {
              'conditions' => {
                'operators' => OPERATORS.each_with_object({}) do |operator, acc|
                  acc[operator.fetch(:symbol)] = { 'label' => operator.fetch(:label) }
                end,
                'functions' => FUNCTIONS.each_with_object({}) do |function, acc|
                  acc[function.fetch(:name)] = { 'label' => function.fetch(:label) }
                end
              }
            }
          end

          def frontend_metadata(reference_fields:)
            {
              root_requirement: ROOT_REQUIREMENT,
              operators: OPERATORS.map do |operator|
                {
                  symbol: operator.fetch(:symbol),
                  category: operator.fetch(:category).to_s,
                  label: operator.fetch(:label),
                  precedence: operator.fetch(:precedence),
                  register_in_frontend_parser: operator.fetch(:register_in_frontend_parser)
                }
              end,
              functions: FUNCTIONS.map do |function|
                {
                  name: function.fetch(:name),
                  label: function.fetch(:label),
                  signature: function.fetch(:signature),
                  description: function.fetch(:description),
                  min_args: function.fetch(:min_args),
                  max_args: function.fetch(:max_args),
                  return_kind: function.fetch(:return_kind).to_s,
                  numeric_arguments: function.fetch(:numeric_arguments),
                  positive_integer_literal_indexes: function.fetch(:positive_integer_literal_indexes)
                }
              end,
              references: {
                candle_fields: Array(reference_fields),
                module_output: MODULE_OUTPUT_REFERENCE,
                params_prefix: PARAMS_REFERENCE
              }
            }
          end

          def arity_error_message(function)
            min_args = function.fetch(:min_args)
            max_args = function.fetch(:max_args)
            name = function.fetch(:name)

            if min_args == max_args
              "#{name}() expects exactly #{min_args} argument#{'s' unless min_args == 1}"
            else
              "#{name}() expects at least #{min_args} arguments"
            end
          end

          def positive_integer_literal_error_message(function, index)
            ordinal = case index
            when 0 then 'first'
            when 1 then 'second'
            when 2 then 'third'
            else
              "argument #{index + 1}"
            end

            "#{function.fetch(:name)}() expects a positive integer literal as the #{ordinal} argument"
          end
        end
      end
    end
  end
end
