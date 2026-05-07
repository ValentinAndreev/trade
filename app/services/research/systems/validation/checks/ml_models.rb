# frozen_string_literal: true

module Research
  module Systems
    module Validation
      module Checks
        module MlModels
          ML_FEATURE_METADATA_KEYS = %w[module_version definition_checksum output_fields warmup lookahead].freeze

          private

          def validate_ml_models
            ml_modules.each do |module_name, module_payload|
              path = [ 'modules', module_name.to_s ]
              validate_ml_model(module_payload, path)
            end
          end

          def validate_ml_model(module_payload, path)
            model_key = module_payload['model_key'].to_s
            if model_key.blank?
              add_error(message: 'ML model key is required', path: path + [ 'model_key' ], code: 'ml_model_key_required')
              return
            end

            output = module_payload.fetch('output', 'probability').to_s
            unless Research::Modules::MlSignal::NUMERIC_OUTPUTS.include?(output)
              add_error(
                message: "Unsupported numeric ML signal output: #{output}",
                path: path + [ 'output' ],
                code: 'ml_model_output'
              )
              return
            end

            model = ml_models_by_key[model_key]
            unless model
              add_error(message: "Unknown ML model: #{model_key}", path: path + [ 'model_key' ], code: 'ml_model_unknown')
              return
            end

            validate_ml_model_serving_state(model, model_key, path)
            validate_ml_model_dataset_compatibility(model, model_key, path)
            validate_ml_feature_spec(model, model_key, path)
          end

          def validate_ml_model_serving_state(model, model_key, path)
            return if model.trained? && model.latest_successful_training_run

            add_error(
              message: "ML model is not trained: #{model_key}",
              path: path + [ 'model_key' ],
              code: 'ml_model_untrained'
            )
          end

          def validate_ml_model_dataset_compatibility(model, model_key, path)
            return unless validation_dataset

            dataset_spec = model.latest_successful_training_run&.dataset_spec.to_h.stringify_keys
            expected = validation_dataset.stringify_keys
            mismatches = %w[symbol timeframe exchange].filter_map do |key|
              expected_value = expected[key].presence
              actual_value = dataset_spec[key].presence
              next unless expected_value
              next if actual_value && normalize_dataset_value(key, expected_value) == normalize_dataset_value(key, actual_value)

              "#{key}=#{actual_value || '<missing>'}"
            end
            return if mismatches.empty?

            add_error(
              message: "ML model #{model_key} is incompatible with dataset: #{mismatches.join(', ')}",
              path: path + [ 'model_key' ],
              code: 'ml_model_incompatible'
            )
          end

          def normalize_dataset_value(key, value)
            case key.to_s
            when 'symbol' then value.to_s.strip.upcase
            when 'exchange', 'timeframe' then value.to_s.strip.downcase
            else value.to_s.strip
            end
          end

          def validate_ml_feature_spec(model, model_key, path)
            feature_spec = Array(model.latest_successful_training_run&.resolved_feature_spec)
            feature_spec.each_with_index do |entry, index|
              payload = entry.to_h.stringify_keys
              missing = ML_FEATURE_METADATA_KEYS.reject { |key| payload.key?(key) }
              if missing.any?
                add_error(
                  message: "ML model #{model_key} feature #{index} is missing metadata: #{missing.join(', ')}",
                  path: path + [ 'model_key' ],
                  code: 'ml_model_feature_metadata'
                )
                next
              end

              validate_ml_feature_definition_current(model_key, payload, index, path)

              next unless payload.fetch('lookahead').to_i.positive?

              add_error(
                message: "ML model #{model_key} uses positive-lookahead feature #{index}",
                path: path + [ 'model_key' ],
                code: 'ml_model_feature_lookahead'
              )
            end
          end

          def validate_ml_feature_definition_current(model_key, payload, index, path)
            mismatches = Ml::FeatureDefinitionCompatibility.new([ payload ]).mismatches
            mismatches.each do |mismatch|
              add_error(
                message: "ML model #{model_key} feature #{index} is stale: #{mismatch.message}",
                path: path + [ 'model_key' ],
                code: 'ml_model_feature_stale'
              )
            end
          end

          def ml_modules
            return [] if @diagnostics.any?

            @payload.fetch('modules').select { |_name, module_payload| module_payload.fetch('type').to_s == 'ml_signal' }
          end

          def ml_models_by_key
            @ml_models_by_key ||= begin
              keys = ml_modules.filter_map { |_name, module_payload| module_payload['model_key'].presence }.map(&:to_s).uniq
              MlModel.where(key: keys).includes(:latest_successful_training_run).index_by(&:key)
            end
          end
        end
      end
    end
  end
end
