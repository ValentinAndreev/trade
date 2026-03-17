# frozen_string_literal: true

module Research
  module Dsl
    module Validators
      class ParamsValidator
        class << self
          def validate(context)
            params_payload = context.payload['params']
            return if params_payload.nil?

            unless params_payload.is_a?(Hash)
              context.add_error(message: 'params must be a mapping', path: [ 'params' ], code: 'params_type')
              return
            end

            Research::Dsl::Validators::UnknownKeysValidator.validate(
              context: context,
              path: [ 'params' ],
              actual_keys: params_payload.keys,
              allowed_keys: context.dictionary.fetch('params').keys
            )

            context.dictionary.fetch('params').each do |key, rule|
              next unless params_payload.key?(key)

              Research::Dsl::Validators::ScalarValidator.validate(
                context: context,
                rule: rule,
                value: params_payload[key],
                path: [ 'params', key ]
              )
            end
          end
        end
      end
    end
  end
end
