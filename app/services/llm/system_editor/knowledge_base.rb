# frozen_string_literal: true

module Llm
  module SystemEditor
    class KnowledgeBase
      PROMPT_NAMESPACE = 'llm/system_editor'.freeze

      class << self
        def dsl = load_yaml('dsl.yml')
        def modules = load_yaml('modules.yml')
        def examples = load_yaml('examples.yml')

        private

        def load_yaml(file_name)
          Llm::PromptLibrary.load_yaml("#{PROMPT_NAMESPACE}/#{file_name}")
        end
      end
    end
  end
end
