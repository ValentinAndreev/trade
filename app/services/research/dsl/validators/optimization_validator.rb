# frozen_string_literal: true

module Research
  module Dsl
    module Validators
      class OptimizationValidator
        class << self
          def validate(context)
            optimization_payload = context.payload['optimization']
            return if optimization_payload.nil?

            unless optimization_payload.is_a?(Hash)
              context.add_error(message: 'optimization must be a mapping', path: [ 'optimization' ], code: 'optimization_type')
              return
            end

            Research::Dsl::Validators::UnknownKeysValidator.validate(
              context: context,
              path: [ 'optimization' ],
              actual_keys: optimization_payload.keys,
              allowed_keys: context.dictionary.dig('optimization', 'keys')
            )

            targets = optimization_payload['targets']
            return if targets.nil?

            unless targets.is_a?(Array)
              context.add_error(
                message: 'optimization.targets must be a list',
                path: [ 'optimization', 'targets' ],
                code: 'optimization_targets'
              )
              return
            end

            targets.each_with_index do |target, index|
              Research::Dsl::Validators::OptimizationTargetValidator.validate(
                context: context,
                value: target,
                module_payload: context.payload['module'],
                params_payload: context.payload['params'],
                path: [ 'optimization', 'targets', index.to_s ]
              )
            end
          end
        end
      end
    end
  end
end
