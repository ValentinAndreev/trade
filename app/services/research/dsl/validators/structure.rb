# frozen_string_literal: true

module Research
  module Dsl
    module Validators
      module Structure
        REQUIRED_ROOT_KEYS = %w[id name module conditions].freeze

        private

        def validate_structure
          validate_unknown_keys([], @payload.keys, @dictionary.fetch('root_keys'))

          REQUIRED_ROOT_KEYS.each do |key|
            add_error(message: "Missing required key: #{key}", path: [ key ], code: 'missing_key') unless @payload.key?(key)
          end

          validate_module
          validate_params
        end

        def validate_module
          module_payload = @payload['module']
          unless module_payload.is_a?(Hash)
            add_error(message: 'module must be a mapping', path: [ 'module' ], code: 'module_type')
            return
          end

          validate_unknown_keys([ 'module' ], module_payload.keys, @dictionary.dig('module', 'keys'))

          module_type = module_payload['type'].to_s
          module_dict = @dictionary.dig('module', 'types', module_type)
          unless module_dict
            add_error(message: "Unsupported module type: #{module_type}", path: [ 'module', 'type' ], code: 'module_type')
            return
          end

          module_params = module_payload['params']
          unless module_params.is_a?(Hash)
            add_error(message: 'module.params must be a mapping', path: [ 'module', 'params' ], code: 'module_params')
            return
          end

          validate_unknown_keys([ 'module', 'params' ], module_params.keys, module_dict.fetch('params').keys)
          module_dict.fetch('params').each do |key, rule|
            validate_scalar(rule, module_params[key], [ 'module', 'params', key ]) if module_params.key?(key)
          end
        end

        def validate_params
          params_payload = @payload['params']
          return if params_payload.nil?

          unless params_payload.is_a?(Hash)
            add_error(message: 'params must be a mapping', path: [ 'params' ], code: 'params_type')
            return
          end

          validate_unknown_keys([ 'params' ], params_payload.keys, @dictionary.fetch('params').keys)
          @dictionary.fetch('params').each do |key, rule|
            validate_scalar(rule, params_payload[key], [ 'params', key ]) if params_payload.key?(key)
          end
        end

        def validate_scalar(rule, value, path)
          case rule['type']
          when 'integer'
            unless integer_like?(value)
              add_error(message: 'Expected integer value', path: path, code: 'scalar_integer')
              return
            end
            min = rule['min']
            add_error(message: "Value must be >= #{min}", path: path, code: 'scalar_min') if min && value.to_i < min.to_i
          when 'number'
            add_error(message: 'Expected numeric value', path: path, code: 'scalar_number') unless numeric_like?(value)
          when 'enum'
            allowed = Array(rule['values']).map(&:to_s)
            add_error(message: "Expected one of: #{allowed.join(', ')}", path: path, code: 'scalar_enum') unless allowed.include?(value.to_s)
          end
        end
      end
    end
  end
end
