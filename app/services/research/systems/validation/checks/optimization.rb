# frozen_string_literal: true

module Research
  module Systems
    module Validation
      module Checks
        module Optimization
          private

          def validate_optimization
            optimization_payload = @payload['optimization']
            return if optimization_payload.nil?

            unless optimization_payload.is_a?(Hash)
              add_error(message: 'optimization must be a mapping', path: [ 'optimization' ], code: 'optimization_type')
              return
            end

            validate_unknown_keys([ 'optimization' ], optimization_payload.keys, @schema.dig('optimization', 'keys'))

            targets = optimization_payload['targets']
            return if targets.nil?

            unless targets.is_a?(Array)
              add_error(message: 'optimization.targets must be a list', path: [ 'optimization', 'targets' ], code: 'optimization_targets')
              return
            end

            targets.each_with_index do |target, index|
              validate_optimization_target(target, [ 'optimization', 'targets', index.to_s ])
            end
          end

          def validate_optimization_target(value, path)
            unless value.is_a?(String)
              add_error(message: 'Optimization target must be a string', path:, code: 'optimization_target')
              return
            end

            if value.start_with?('params.')
              validate_param_target(value, path)
              return
            end

            module_name, param_key = value.split('.', 2)
            modules_payload = @payload['modules']
            module_payload = modules_payload.is_a?(Hash) ? modules_payload[module_name] : nil
            unless module_payload.is_a?(Hash)
              add_error(message: "Unknown optimization target: #{value}", path:, code: 'optimization_target')
              return
            end

            module_type = module_payload['type']&.to_s
            module_param_rule = @schema.dig('modules', 'types', module_type, 'params', param_key)
            unless module_param_rule
              add_error(message: "Unknown optimization target: #{value}", path:, code: 'optimization_target')
              return
            end

            return if module_payload.key?(param_key)

            add_error(message: "Optimization target param is not defined: #{value}", path:, code: 'optimization_target')
          end

          def validate_param_target(value, path)
            param_key = value.delete_prefix('params.')
            unless @schema.fetch('params').key?(param_key)
              add_error(message: "Unknown optimization target: #{value}", path:, code: 'optimization_target')
              return
            end

            params_payload = @payload['params']
            return if params_payload.is_a?(Hash) && params_payload.key?(param_key)

            add_error(message: "Optimization target param is not defined: #{value}", path:, code: 'optimization_target')
          end
        end
      end
    end
  end
end
