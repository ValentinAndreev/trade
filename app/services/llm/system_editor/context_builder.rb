# frozen_string_literal: true

require 'json'

module Llm
  module SystemEditor
    class ContextBuilder
      class << self
        def call(editor_context:)
          normalized = normalize_editor_context(editor_context)

          {
            editor: normalized,
            dsl: KnowledgeBase.dsl,
            modules: KnowledgeBase.modules,
            examples: KnowledgeBase.examples,
            condition_expression: Research::Systems::EditorMetadata.response[:condition_expression]
          }
        end

        def prompt_json(editor_context:) = JSON.pretty_generate(call(editor_context:))

        def normalize_editor_context(editor_context)
          context = editor_context.to_h.deep_symbolize_keys

          {
            system_id: context[:system_id].to_s.presence,
            source_path: context[:source_path].to_s.presence,
            yaml_hash: context[:yaml_hash].to_s.presence,
            system_yaml: context[:system_yaml].to_s,
            diagnostics: Array(context[:diagnostics]).map do |diagnostic|
              diagnostic.to_h.slice(:message, :line, :column, :length, :code, :path)
            end
          }
        end
      end
    end
  end
end
