# frozen_string_literal: true

module Research
  module Dsl
    module Validators
      class ConditionsValidator
        ENTRY_KEYS = %w[long_entry short_entry].freeze

        class << self
          def validate(context)
            conditions_payload = context.payload['conditions']
            unless conditions_payload.is_a?(Hash)
              context.add_error(message: 'conditions must be a mapping', path: [ 'conditions' ], code: 'conditions_type')
              return
            end

            Research::Dsl::Validators::UnknownKeysValidator.validate(
              context: context,
              path: [ 'conditions' ],
              actual_keys: conditions_payload.keys,
              allowed_keys: context.dictionary.dig('conditions', 'keys')
            )

            conditions_payload.each do |condition_name, rule_payload|
              Research::Dsl::Validators::ConditionRuleValidator.validate(
                context: context,
                condition_name: condition_name,
                rule_payload: rule_payload,
                params_payload: context.payload['params']
              )
            end

            return if conditions_payload.keys.any? { |key| ENTRY_KEYS.include?(key.to_s) }

            context.add_error(
              message: 'At least one entry condition is required',
              path: [ 'conditions' ],
              code: 'condition_entry'
            )
          end
        end
      end
    end
  end
end
