# frozen_string_literal: true

module Research
  module Dsl
    module Validators
      module Structure
        REQUIRED_ROOT_KEYS = %w[id name modules conditions].freeze

        private

        def validate_structure
          validate_unknown_keys([], @payload.keys, @dictionary.fetch('root_keys'))

          REQUIRED_ROOT_KEYS.each do |key|
            add_error(message: "Missing required key: #{key}", path: [ key ], code: 'missing_key') unless @payload.key?(key)
          end

          validate_modules
          validate_params
        end

        def validate_modules
          modules_payload = @payload['modules']
          unless modules_payload.is_a?(Hash)
            add_error(message: 'modules must be a mapping', path: [ 'modules' ], code: 'modules_type')
            return
          end

          add_error(message: 'At least one module is required', path: [ 'modules' ], code: 'modules_empty') if modules_payload.empty?

          modules_payload.each do |module_name, module_payload|
            path = [ 'modules', module_name.to_s ]
            validate_module_definition(module_name.to_s, module_payload, path)
          end
        end

        def validate_module_definition(module_name, module_payload, path)
          unless module_payload.is_a?(Hash)
            add_error(message: "#{module_name} must be a mapping", path: path, code: 'module_type')
            return
          end

          module_type = module_payload['type']&.to_s
          if module_type.blank?
            add_error(message: 'Missing required key: type', path: path + [ 'type' ], code: 'missing_key')
            return
          end

          module_dict = @dictionary.dig('modules', 'types', module_type)
          unless module_dict
            add_error(message: "Unsupported module type: #{module_type}", path: path + [ 'type' ], code: 'module_type')
            return
          end

          validate_unknown_keys(path, module_payload.keys, [ 'type', *module_dict.fetch('params').keys ])
          module_dict.fetch('params').each do |key, rule|
            validate_scalar(rule, module_payload[key], path + [ key ]) if module_payload.key?(key)
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
