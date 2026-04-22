# frozen_string_literal: true

require 'json'

module Llm
  module SystemEditor
    class ContextBuilder
      class << self
        def call(assistant_context:)
          from_normalized(Llm::ContextNormalizer.call(assistant_context))
        end

        # Builds the context hash from an already-normalized context, skipping the
        # second ContextNormalizer.call. Use this when the caller already holds a
        # normalized context (e.g. inside an agent or ChatRunner).
        def from_normalized(normalized_context)
          {
            assistant: normalized_context.slice(:host_type, :harness, :linked_target, :workspace_snapshot, :referenced_tab_ids),
            editor: normalized_context[:editor_context],
            dsl: KnowledgeBase.dsl,
            modules: KnowledgeBase.modules,
            macro_indicators: KnowledgeBase.macro_indicators,
            examples: KnowledgeBase.examples,
            condition_expression: Research::Systems::EditorMetadata.response[:condition_expression]
          }
        end

        def prompt_json(assistant_context:) = JSON.pretty_generate(call(assistant_context:))

        def prompt_json_normalized(normalized_context) = JSON.pretty_generate(from_normalized(normalized_context))

        # Prompt path for the plain-chat instructions template, kept here so ChatRunner
        # doesn't need to reference KnowledgeBase::PROMPT_NAMESPACE directly.
        def plain_chat_instructions_prompt = "#{KnowledgeBase::PROMPT_NAMESPACE}/plain_chat_instructions"
      end
    end
  end
end
