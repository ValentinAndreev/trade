# frozen_string_literal: true

module Research
  module Dsl
    module Validators
      module Optimization
        private

        def validate_optimization
          optimization_payload = @payload['optimization']
          return if optimization_payload.nil?

          unless optimization_payload.is_a?(Hash)
            add_error(message: 'optimization must be a mapping', path: [ 'optimization' ], code: 'optimization_type')
            return
          end

          validate_unknown_keys([ 'optimization' ], optimization_payload.keys, @dictionary.dig('optimization', 'keys'))

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
            add_error(message: 'Optimization target must be a string', path: path, code: 'optimization_target')
            return
          end

          if value == 'module.period'
            module_payload = @payload['module']
            period = module_payload.is_a?(Hash) ? module_payload.dig('params', 'period') : nil
            add_error(message: 'module.period target requires module.params.period', path: path, code: 'optimization_target') unless numeric_like?(period)
            return
          end

          unless value.start_with?('params.')
            add_error(message: "Unsupported optimization target: #{value}", path: path, code: 'optimization_target')
            return
          end

          param_key = value.delete_prefix('params.')
          unless @dictionary.fetch('params').key?(param_key)
            add_error(message: "Unknown optimization target: #{value}", path: path, code: 'optimization_target')
            return
          end

          params_payload = @payload['params']
          return if params_payload.is_a?(Hash) && params_payload.key?(param_key)

          add_error(message: "Optimization target param is not defined: #{value}", path: path, code: 'optimization_target')
        end
      end
    end
  end
end
