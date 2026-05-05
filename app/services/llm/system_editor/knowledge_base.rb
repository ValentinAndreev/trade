# frozen_string_literal: true

module Llm
  module SystemEditor
    class KnowledgeBase
      PROMPT_NAMESPACE = 'llm/system_editor'.freeze

      class << self
        def dsl = load_yaml('dsl.yml')
        def examples = load_yaml('examples.yml')

        def modules
          meta = load_yaml('modules_meta.yml')
          schema_types = Research::Systems::Schema.data.dig('modules', 'types') || {}
          schema_types.each_with_object({}) do |(type, schema_def), result|
            result[type] = build_module_doc(schema_def, meta.fetch(type, {}))
          end
        end

        def macro_indicators
          meta = load_yaml('modules_meta.yml').fetch('macro_indicators', {})
          schema_indicators = Research::Systems::Schema.data.dig('macro_indicators') || {}
          schema_indicators.each_with_object({}) do |(key, schema_def), result|
            indicator_meta = meta.fetch(key, {})
            result[key] = {
              'label'       => schema_def['label'],
              'category'    => schema_def['category'],
              'description' => indicator_meta['description']
            }.compact
          end
        end

        private

        def build_module_doc(schema_def, meta)
          params = (schema_def['params'] || {}).each_with_object({}) do |(key, rule), acc|
            param_doc = { 'type' => rule['type'] }
            param_doc['values'] = rule['values'] if rule.key?('values')
            param_doc['min'] = rule['min'] if rule['min']
            param_doc['max'] = rule['max'] if rule['max']
            param_doc['required'] = true if rule['required']
            param_doc['default'] = rule['default'] if rule.key?('default')
            param_doc['description'] = meta.dig('params', key) if meta.dig('params', key)
            acc[key] = param_doc
          end
          {
            'label'       => meta['label'] || schema_def['label'],
            'description' => meta['description'] || schema_def['description'],
            'output'      => meta['output'],
            'output_fields' => schema_def['output_fields'],
            'params'      => params,
            'module_version' => schema_def['module_version'],
            'definition_checksum' => schema_def['definition_checksum'],
            'warmup' => schema_def['warmup'],
            'lookahead' => schema_def['lookahead'],
            'formula' => schema_def['formula'],
            'heuristic' => schema_def['heuristic'],
            'ml_feature_eligible' => schema_def['ml_feature_eligible']
          }.compact
        end

        def load_yaml(file_name)
          Llm::PromptLibrary.load_yaml("#{PROMPT_NAMESPACE}/#{file_name}")
        end
      end
    end
  end
end
