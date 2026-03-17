# frozen_string_literal: true

module Research
  module Dsl
    module Validators
      class OptimizationTargetValidator
        class << self
          def validate(context:, value:, module_payload:, params_payload:, path:)
            unless value.is_a?(String)
              context.add_error(message: 'Optimization target must be a string', path:, code: 'optimization_target')
              return
            end

            return validate_module_period(context:, module_payload:, path:) if value == 'module.period'

            validate_param_target(context:, value:, params_payload:, path:)
          end

          private

          def validate_module_period(context:, module_payload:, path:)
            period = module_payload.is_a?(Hash) ? module_payload.dig('params', 'period') : nil
            return if numeric_like?(period)

            context.add_error(
              message: 'module.period target requires module.params.period',
              path: path,
              code: 'optimization_target'
            )
          end

          def validate_param_target(context:, value:, params_payload:, path:)
            unless value.start_with?('params.')
              context.add_error(
                message: "Unsupported optimization target: #{value}",
                path: path,
                code: 'optimization_target'
              )
              return
            end

            param_key = value.delete_prefix('params.')
            unless context.dictionary.fetch('params').key?(param_key)
              context.add_error(
                message: "Unknown optimization target: #{value}",
                path: path,
                code: 'optimization_target'
              )
              return
            end

            return if params_payload.is_a?(Hash) && params_payload.key?(param_key)

            context.add_error(
              message: "Optimization target param is not defined: #{value}",
              path: path,
              code: 'optimization_target'
            )
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
