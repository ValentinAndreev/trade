# frozen_string_literal: true

module Research
  module Dsl
    module Validators
      class UnknownKeysValidator
        class << self
          def validate(context:, path:, actual_keys:, allowed_keys:)
            actual_keys.map(&:to_s).each do |key|
              next if allowed_keys.map(&:to_s).include?(key)

              context.add_error(
                message: "Unknown key: #{key}",
                path: path + [ key ],
                key_path: path,
                code: 'unknown_key'
              )
            end
          end
        end
      end
    end
  end
end
