# frozen_string_literal: true

module Llm
  class SystemEditorAgent < RubyLLM::Agent
    chat_model AiChat
    inputs :editor_context
    instructions

    tools do
      [
        Llm::SystemEditor::Tools::ValidateSystemYamlTool.new,
        Llm::SystemEditor::Tools::ApplySystemDraftTool.new(editor_context: editor_context),
        Llm::SystemEditor::Tools::LoadExampleSystemTool.new,
        Llm::SystemEditor::Tools::LoadDslReferenceTool.new
      ]
    end
  end
end
