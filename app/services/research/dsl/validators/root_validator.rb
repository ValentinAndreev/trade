# frozen_string_literal: true

module Research
  module Dsl
    module Validators
      class RootValidator
        REQUIRED_KEYS = %w[id name module conditions].freeze

        class << self
          def validate(context)
            payload = context.payload

            Research::Dsl::Validators::UnknownKeysValidator.validate(
              context: context,
              path: [],
              actual_keys: payload.keys,
              allowed_keys: context.dictionary.fetch('root_keys')
            )

            REQUIRED_KEYS.each do |required_key|
              next if payload.key?(required_key)

              context.add_error(
                message: "Missing required key: #{required_key}",
                path: [ required_key ],
                code: 'missing_key'
              )
            end
          end
        end
      end
    end
  end
end
