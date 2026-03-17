# frozen_string_literal: true

module Research
  module Dsl
    module Validators
      class ConditionRuleValidator
        class << self
          def validate(context:, condition_name:, rule_payload:, params_payload:)
            path = [ 'conditions', condition_name.to_s ]

            unless rule_payload.is_a?(Hash)
              context.add_error(message: "#{condition_name} must be a mapping", path:, code: 'condition_rule')
              return
            end

            Research::Dsl::Validators::UnknownKeysValidator.validate(
              context: context,
              path: path,
              actual_keys: rule_payload.keys,
              allowed_keys: context.dictionary.dig('conditions', 'rule_keys')
            )

            validate_operator(context:, rule_payload:, path:)
            validate_operands(context:, rule_payload:, path:, params_payload:)
          end

          private

          def validate_operator(context:, rule_payload:, path:)
            operator = rule_payload['operator'].to_s
            return if context.dictionary.dig('conditions', 'operators', operator)

            context.add_error(
              message: "Unsupported operator: #{operator}",
              path: path + [ 'operator' ],
              code: 'condition_operator'
            )
          end

          def validate_operands(context:, rule_payload:, path:, params_payload:)
            %w[left right].each do |operand_key|
              if rule_payload.key?(operand_key)
                Research::Dsl::Validators::OperandValidator.validate(
                  context: context,
                  value: rule_payload[operand_key],
                  path: path + [ operand_key ],
                  params_payload: params_payload
                )
              else
                context.add_error(
                  message: "Missing #{operand_key} operand",
                  path: path + [ operand_key ],
                  code: 'condition_operand'
                )
              end
            end
          end
        end
      end
    end
  end
end
