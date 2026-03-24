# frozen_string_literal: true

module Llm
  module SystemEditor
    module Tools
      class ApplySystemDraftTool < RubyLLM::Tool
        description 'Validate a final YAML draft before returning it to the editor UI. Always call this before claiming the YAML is ready.'

        param :yaml, desc: 'Full YAML document for the final draft'

        def initialize(editor_context:)
          @editor_context = ContextBuilder.normalize_editor_context(editor_context)
        end

        def name = 'apply_system_draft'

        def execute(yaml:)
          validation = Research::Systems::Validation::Validator.new(yaml.to_s).call

          halt(JSON.generate(
            {
              ok: validation.valid?,
              draft_yaml: yaml.to_s,
              diagnostics: validation.diagnostics.map(&:to_h),
              system: validation.metadata,
              source_yaml_hash: @editor_context.fetch(:yaml_hash, nil)
            }
          ))
        end
      end
    end
  end
end
