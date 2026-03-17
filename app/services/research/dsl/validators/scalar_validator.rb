# frozen_string_literal: true

module Research
  module Dsl
    module Validators
      class ScalarValidator
        class << self
          def validate(context:, rule:, value:, path:)
            case rule['type']
            when 'integer'
              validate_integer(context:, value:, path:, min: rule['min'])
            when 'number'
              context.add_error(message: 'Expected numeric value', path:, code: 'scalar_number') unless numeric_like?(value)
            when 'enum'
              validate_enum(context:, value:, path:, allowed_values: Array(rule['values']).map(&:to_s))
            end
          end

          private

          def validate_integer(context:, value:, path:, min:)
            unless integer_like?(value)
              context.add_error(message: 'Expected integer value', path:, code: 'scalar_integer')
              return
            end

            return if min.nil? || value.to_i >= min.to_i

            context.add_error(message: "Value must be >= #{min}", path:, code: 'scalar_min')
          end

          def validate_enum(context:, value:, path:, allowed_values:)
            return if allowed_values.include?(value.to_s)

            context.add_error(
              message: "Expected one of: #{allowed_values.join(', ')}",
              path: path,
              code: 'scalar_enum'
            )
          end

          def integer_like?(value)
            Integer(value)
            true
          rescue ArgumentError, TypeError
            false
          end

          def numeric_like?(value)
            Float(value)
            true
          rescue ArgumentError, TypeError
            false
          end
        end
      end
    end
  end
end
