# frozen_string_literal: true

module Llm
  module SystemEditor
    module Tools
      class ValidateSystemYamlTool < RubyLLM::Tool
        description 'Validate a complete trading-system YAML document against the research DSL.'

        param :yaml, desc: 'Full YAML document to validate'

        def name = 'validate_system_yaml'

        def execute(yaml:)
          validation = Research::Systems::Validation::Validator.new(yaml.to_s).call

          {
            ok: validation.valid?,
            diagnostics: validation.diagnostics.map(&:to_h),
            system: validation.metadata
          }
        end
      end
    end
  end
end
