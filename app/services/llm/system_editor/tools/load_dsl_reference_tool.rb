# frozen_string_literal: true

module Llm
  module SystemEditor
    module Tools
      class LoadDslReferenceTool < RubyLLM::Tool
        description 'Return the current DSL reference, supported modules and condition syntax metadata.'

        def name = 'load_dsl_reference'

        def execute
          {
            dsl: KnowledgeBase.dsl,
            modules: KnowledgeBase.modules,
            examples: KnowledgeBase.examples,
            condition_expression: Research::Systems::EditorMetadata.response[:condition_expression]
          }
        end
      end
    end
  end
end
