# frozen_string_literal: true

module Research
  module Dsl
    module Validators
      class OperandValidator
        class << self
          def validate(context:, value:, path:, params_payload:)
            return if numeric_like?(value)

            unless value.is_a?(String)
              context.add_error(message: 'Operand must be a number or reference', path:, code: 'operand_type')
              return
            end

            return if context.dictionary.dig('references', 'fields').include?(value)
            return if context.dictionary.dig('references', 'module').include?(value)

            validate_param_reference(context:, value:, path:, params_payload:)
          end

          private

          def validate_param_reference(context:, value:, path:, params_payload:)
            unless value.start_with?('params.')
              context.add_error(message: "Unknown reference: #{value}", path:, code: 'operand_reference')
              return
            end

            param_key = value.delete_prefix('params.')
            unless context.dictionary.fetch('params').key?(param_key)
              context.add_error(message: "Unknown params reference: #{value}", path:, code: 'operand_reference')
              return
            end

            return if params_payload.is_a?(Hash) && params_payload.key?(param_key)

            context.add_error(message: "Referenced param is not defined: #{value}", path:, code: 'operand_reference')
          end

          def numeric_like?(value)
            Float(value)
            true
          rescue ArgumentError, TypeError
            false
          end
        end
      end
    end
  end
end
