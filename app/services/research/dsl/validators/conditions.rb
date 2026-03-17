# frozen_string_literal: true

module Research
  module Dsl
    module Validators
      module Conditions
        ENTRY_KEYS = %w[long_entry short_entry].freeze

        private

        def validate_conditions
          conditions_payload = @payload['conditions']
          unless conditions_payload.is_a?(Hash)
            add_error(message: 'conditions must be a mapping', path: [ 'conditions' ], code: 'conditions_type')
            return
          end

          validate_unknown_keys([ 'conditions' ], conditions_payload.keys, @dictionary.dig('conditions', 'keys'))
          conditions_payload.each { |name, rule_payload| validate_condition_rule(name, rule_payload) }

          return if conditions_payload.keys.any? { |k| ENTRY_KEYS.include?(k.to_s) }

          add_error(message: 'At least one entry condition is required', path: [ 'conditions' ], code: 'condition_entry')
        end

        def validate_condition_rule(condition_name, rule_payload)
          path = [ 'conditions', condition_name.to_s ]
          unless rule_payload.is_a?(Hash)
            add_error(message: "#{condition_name} must be a mapping", path: path, code: 'condition_rule')
            return
          end

          validate_unknown_keys(path, rule_payload.keys, @dictionary.dig('conditions', 'rule_keys'))

          operator = rule_payload['operator'].to_s
          unless @dictionary.dig('conditions', 'operators', operator)
            add_error(message: "Unsupported operator: #{operator}", path: path + [ 'operator' ], code: 'condition_operator')
          end

          %w[left right].each do |operand_key|
            if rule_payload.key?(operand_key)
              validate_operand(rule_payload[operand_key], path + [ operand_key ])
            else
              add_error(message: "Missing #{operand_key} operand", path: path + [ operand_key ], code: 'condition_operand')
            end
          end
        end

        def validate_operand(value, path)
          return if numeric_like?(value)

          unless value.is_a?(String)
            add_error(message: 'Operand must be a number or reference', path: path, code: 'operand_type')
            return
          end

          return if @dictionary.dig('references', 'fields').include?(value)
          return if @dictionary.dig('references', 'module').include?(value)

          unless value.start_with?('params.')
            add_error(message: "Unknown reference: #{value}", path: path, code: 'operand_reference')
            return
          end

          param_key = value.delete_prefix('params.')
          unless @dictionary.fetch('params').key?(param_key)
            add_error(message: "Unknown params reference: #{value}", path: path, code: 'operand_reference')
            return
          end

          params_payload = @payload['params']
          return if params_payload.is_a?(Hash) && params_payload.key?(param_key)

          add_error(message: "Referenced param is not defined: #{value}", path: path, code: 'operand_reference')
        end
      end
    end
  end
end
