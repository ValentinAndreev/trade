# frozen_string_literal: true

module Llm
  module SystemEditor
    class DraftEnvelope
      class << self
        def build(yaml:, source_yaml_hash:, validation:, suggested_target: nil, fallback_target: nil)
          normalized_validation = normalize_validation(validation)
          {
            'kind' => 'system_draft',
            'yaml' => yaml.to_s,
            'source_yaml_hash' => source_yaml_hash.presence,
            'validation' => normalized_validation,
            'suggested_target' => normalize_suggested_target(suggested_target, fallback_target:, validation: normalized_validation)
          }
        end

        def from_payload(payload, fallback_target: nil)
          data = payload.to_h.deep_stringify_keys

          build(
            yaml: data['yaml'],
            source_yaml_hash: data['source_yaml_hash'],
            validation: data['validation'],
            suggested_target: data['suggested_target'],
            fallback_target:
          )
        end

        private

        def normalize_validation(validation)
          data = validation.to_h.deep_stringify_keys

          {
            'ok' => data['ok'],
            'diagnostics' => Array(data['diagnostics']),
            'system' => data['system'].presence
          }
        end

        def normalize_suggested_target(target, fallback_target:, validation:)
          [
            target,
            fallback_target,
            target_from_validation(validation)
          ].filter_map { |candidate| normalize_target(candidate) }.first
        end

        def target_from_validation(validation)
          system = validation['system']
          return unless system.is_a?(Hash)

          {
            'type' => 'system_editor',
            'system_id' => system['id'],
            'source_path' => system['source_path']
          }
        end

        def normalize_target(target)
          data = target.to_h.deep_stringify_keys
          type = data['type'].presence || 'system_editor'
          return unless type == 'system_editor'

          system_id = data['system_id'].presence || data['id'].presence
          source_path = data['source_path'].presence
          return unless system_id || source_path

          {
            'type' => 'system_editor',
            'system_id' => system_id,
            'source_path' => source_path
          }
        end
      end
    end
  end
end
