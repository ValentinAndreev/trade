# frozen_string_literal: true

module Research
  module Systems
    module Validation
      module Checks
        module Conditions
          ENTRY_KEYS = %w[long_entry short_entry].freeze

          private

          def validate_conditions
            conditions_payload = @payload['conditions']
            unless conditions_payload.is_a?(Hash)
              add_error(message: 'conditions must be a mapping', path: [ 'conditions' ], code: 'conditions_type')
              return
            end

            validate_unknown_keys([ 'conditions' ], conditions_payload.keys, @schema.dig('conditions', 'keys'))
            conditions_payload.each { |name, rule_payload| validate_condition_rule(name, rule_payload) }

            return if conditions_payload.keys.any? { |key| ENTRY_KEYS.include?(key.to_s) }

            add_error(message: 'At least one entry condition is required', path: [ 'conditions' ], code: 'condition_entry')
          end

          def validate_condition_rule(condition_name, rule_payload)
            path = [ 'conditions', condition_name.to_s ]
            unless rule_payload.is_a?(String)
              add_error(message: "#{condition_name} must be a string expression", path: path, code: 'condition_rule')
              return
            end

            ast = Research::Systems::ConditionExpression::Parser.new(rule_payload).parse
            validate_condition_expression_references(ast, path)
          rescue Research::Systems::ConditionExpression::ParseError => e
            add_expression_error(
              message: e.message,
              path: path,
              offset: e.offset,
              length: e.length,
              code: 'condition_expression_syntax'
            )
          end

          def validate_condition_expression_references(ast, path)
            extract_references(ast).each do |ref|
              validate_condition_reference(ref, path)
            end
          end

          def extract_references(node)
            Research::Systems::ConditionExpression::Ast.references(node)
          end

          def validate_condition_reference(value, path)
            return if @schema.dig('references', 'fields').include?(value)

            if value.start_with?('params.')
              validate_param_reference(value, path)
              return
            end

            module_name, attribute = value.split('.', 2)
            unless attribute == 'value'
              add_error(message: "Unknown reference: #{value}", path: path, code: 'condition_reference')
              return
            end

            modules_payload = @payload['modules']
            unless modules_payload.is_a?(Hash) && modules_payload.key?(module_name)
              add_error(message: "Unknown module reference: #{value}", path: path, code: 'condition_reference')
            end
          end

          def validate_param_reference(value, path)
            param_key = value.delete_prefix('params.')
            unless @schema.fetch('params').key?(param_key)
              add_error(message: "Unknown params reference: #{value}", path: path, code: 'condition_reference')
              return
            end

            params_payload = @payload['params']
            return if params_payload.is_a?(Hash) && params_payload.key?(param_key)

            add_error(message: "Referenced param is not defined: #{value}", path: path, code: 'condition_reference')
          end
        end
      end
    end
  end
end
