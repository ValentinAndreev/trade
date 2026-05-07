# frozen_string_literal: true

module Research
  module Systems
    module Validation
      module Checks
        module Structure
          REQUIRED_ROOT_KEYS = %w[id name modules conditions].freeze

          private

          def validate_structure
            validate_unknown_keys([], @payload.keys, @schema.fetch('root_keys'))

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
              add_error(message: "#{module_name} must be a mapping", path:, code: 'module_type')
              return
            end

            module_type = module_payload['type']&.to_s
            if module_type.blank?
              add_error(message: 'Missing required key: type', path: path + [ 'type' ], code: 'missing_key')
              return
            end

            module_dict = @schema.dig('modules', 'types', module_type)
            unless module_dict
              add_error(message: "Unsupported module type: #{module_type}", path: path + [ 'type' ], code: 'module_type')
              return
            end

            validate_unknown_keys(path, module_payload.keys, [ 'type', *module_dict.fetch('params').keys ])
            module_dict.fetch('params').each do |key, rule|
              if rule['required'] == true && !module_payload.key?(key)
                add_error(message: "Missing required key: #{key}", path: path + [ key ], code: 'missing_key')
                next
              end

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

            validate_unknown_keys([ 'params' ], params_payload.keys, @schema.fetch('params').keys)
            @schema.fetch('params').each do |key, rule|
              validate_scalar(rule, params_payload[key], [ 'params', key ]) if params_payload.key?(key)
            end
          end

          def validate_scalar(rule, value, path)
            case rule['type']
            when 'integer'
              unless integer_like?(value)
                add_error(message: 'Expected integer value', path:, code: 'scalar_integer')
                return
              end
              min = rule['min']
              add_error(message: "Value must be >= #{min}", path:, code: 'scalar_min') if min && value.to_i < min.to_i
            when 'number'
              unless numeric_like?(value)
                add_error(message: 'Expected numeric value', path:, code: 'scalar_number')
                return
              end
              min = rule['min']
              add_error(message: "Value must be >= #{min}", path:, code: 'scalar_min') if min && value.to_f < min.to_f
            when 'enum'
              allowed = Array(rule['values']).map(&:to_s)
              add_error(message: "Expected one of: #{allowed.join(', ')}", path:, code: 'scalar_enum') unless allowed.include?(value.to_s)
            when 'input_ref'
              validate_input_ref(value, path)
            end
          end

          def validate_input_ref(value, path)
            unless value.is_a?(Hash)
              add_error(message: 'Expected input reference mapping', path:, code: 'input_ref_type')
              return
            end

            ref = value.deep_stringify_keys
            %w[exchange symbol timeframe].each do |field|
              next unless ref.key?(field)

              add_error(message: "Input references cannot specify #{field}", path: path + [ field ], code: 'input_ref_cross_scope')
            end

            kind = ref.fetch('kind', 'ohlcv').to_s
            case kind
            when 'ohlcv'
              validate_input_ref_keys(ref, path, %w[kind field])
              validate_ohlcv_input_ref(ref, path)
            when 'module'
              validate_input_ref_keys(ref, path, %w[kind module_ref output])
              validate_module_input_ref(ref, path)
            when 'external_series'
              validate_input_ref_keys(ref, path, %w[kind key output])
              validate_external_series_input_ref(ref, path)
            else
              add_error(message: "Unsupported input reference kind: #{kind}", path: path + [ 'kind' ], code: 'input_ref_kind')
            end
          end

          def validate_input_ref_keys(ref, path, allowed)
            ref.keys.each do |key|
              next if allowed.include?(key) || %w[exchange symbol timeframe].include?(key)

              add_error(message: "Unknown input reference key: #{key}", path: path + [ key ], code: 'input_ref_unknown_key')
            end
          end

          def validate_ohlcv_input_ref(ref, path)
            field = ref.fetch('field', 'close').to_s
            allowed = Research::Modules::InputResolver::OHLCV_FIELDS
            return if allowed.include?(field)

            add_error(message: "Expected OHLCV field one of: #{allowed.join(', ')}", path: path + [ 'field' ], code: 'input_ref_field')
          end

          def validate_module_input_ref(ref, path)
            module_ref = ref['module_ref'].to_s
            if module_ref.blank?
              add_error(message: 'Input module reference is required', path: path + [ 'module_ref' ], code: 'input_ref_module_ref_required')
              return
            end

            modules = @payload.fetch('modules', {})
            module_names = modules.keys.map(&:to_s)
            unless module_names.include?(module_ref)
              add_error(message: "Unknown input module reference: #{module_ref}", path: path + [ 'module_ref' ], code: 'input_ref_unknown_module')
              return
            end

            if path.first == 'modules' && path[1]
              current_module = path[1].to_s
              current_index = module_names.index(current_module)
              referenced_index = module_names.index(module_ref)
              if current_index && referenced_index && referenced_index >= current_index
                add_error(message: "Input module reference must point to an earlier module: #{module_ref}", path: path + [ 'module_ref' ], code: 'input_ref_module_order')
              end
            end

            module_type = modules.dig(module_ref, 'type').to_s
            module_dict = @schema.dig('modules', 'types', module_type)
            unless module_dict
              add_error(message: "Unsupported input module type: #{module_type}", path: path + [ 'module_ref' ], code: 'input_ref_module_type')
              return
            end

            missing = %w[output_fields warmup lookahead].reject { |key| module_dict.key?(key) }
            if missing.any?
              add_error(message: "Input module #{module_ref} is missing no-lookahead metadata: #{missing.join(', ')}", path: path + [ 'module_ref' ], code: 'input_ref_missing_metadata')
              return
            end

            if module_dict.fetch('lookahead').to_i.positive?
              add_error(message: "Input module #{module_ref} has positive lookahead", path: path + [ 'module_ref' ], code: 'input_ref_positive_lookahead')
              return
            end

            output = ref.fetch('output', 'value').to_s
            allowed_outputs = Array(module_dict.fetch('output_fields')).map(&:to_s)
            return if allowed_outputs.include?(output)

            add_error(message: "Input module #{module_ref} does not expose output: #{output}", path: path + [ 'output' ], code: 'input_ref_output')
          end

          def validate_external_series_input_ref(ref, path)
            key = ref['key'].to_s
            if key.blank?
              add_error(message: 'External series input key is required', path: path + [ 'key' ], code: 'input_ref_external_key_required')
              return
            end

            unless Macro::Catalog.find(key)
              add_error(message: "Unknown external series key: #{key}", path: path + [ 'key' ], code: 'input_ref_external_key')
            end

            output = ref.fetch('output', 'value').to_s
            return if output == 'value'

            add_error(message: 'External series input only supports output=value', path: path + [ 'output' ], code: 'input_ref_output')
          end
        end
      end
    end
  end
end
