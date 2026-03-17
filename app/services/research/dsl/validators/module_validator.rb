# frozen_string_literal: true

module Research
  module Dsl
    module Validators
      class ModuleValidator
        class << self
          def validate(context)
            module_payload = context.payload['module']
            unless module_payload.is_a?(Hash)
              context.add_error(message: 'module must be a mapping', path: [ 'module' ], code: 'module_type')
              return
            end

            Research::Dsl::Validators::UnknownKeysValidator.validate(
              context: context,
              path: [ 'module' ],
              actual_keys: module_payload.keys,
              allowed_keys: context.dictionary.dig('module', 'keys')
            )

            module_type = module_payload['type'].to_s
            module_dictionary = context.dictionary.dig('module', 'types', module_type)
            unless module_dictionary
              context.add_error(
                message: "Unsupported module type: #{module_type}",
                path: [ 'module', 'type' ],
                code: 'module_type'
              )
              return
            end

            module_params = module_payload['params']
            unless module_params.is_a?(Hash)
              context.add_error(
                message: 'module.params must be a mapping',
                path: [ 'module', 'params' ],
                code: 'module_params'
              )
              return
            end

            Research::Dsl::Validators::UnknownKeysValidator.validate(
              context: context,
              path: [ 'module', 'params' ],
              actual_keys: module_params.keys,
              allowed_keys: module_dictionary.fetch('params').keys
            )

            module_dictionary.fetch('params').each do |key, rule|
              next unless module_params.key?(key)

              Research::Dsl::Validators::ScalarValidator.validate(
                context: context,
                rule: rule,
                value: module_params[key],
                path: [ 'module', 'params', key ]
              )
            end
          end
        end
      end
    end
  end
end
