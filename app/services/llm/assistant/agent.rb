# frozen_string_literal: true

module Llm
  module Assistant
    class Agent < RubyLLM::Agent
      chat_model AiChat
      inputs :assistant_context
      instructions(
        {
          prompt: 'instructions',
          locals: {
            # Pre-render the context JSON so the template doesn't need to call
            # ContextBuilder (and therefore ContextNormalizer) a second time.
            context_json: -> { Llm::SystemEditor::ContextBuilder.prompt_json_normalized(assistant_context) },
            # Passed separately so the template can branch on harness without parsing JSON.
            harness: -> { assistant_context[:harness] }
          }
        }
      )

      # `assistant_context` is accessible here because RubyLLM evaluates this block
      # via instance_exec on the agent instance, where `inputs` values are available
      # as methods. Do not extract this block to a regular method — that context is lost.
      tools do
        editor_context = assistant_context[:editor_context] || {}

        base = [
          Llm::SystemEditor::Tools::ValidateSystemYamlTool.new,
          Llm::SystemEditor::Tools::LoadExampleSystemTool.new,
          Llm::SystemEditor::Tools::LoadDslReferenceTool.new
        ]

        # ApplySystemDraftTool requires a linked editor context. Without one the
        # suggested_target would be nil and the frontend would receive an untargeted
        # draft, bypassing the overwrite guard. Only expose the tool in patch mode.
        if assistant_context[:harness] == 'system_patch'
          base + [ Llm::SystemEditor::Tools::ApplySystemDraftTool.new(editor_context:) ]
        else
          base
        end
      end
    end
  end
end
