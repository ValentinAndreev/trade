# frozen_string_literal: true

module Llm
  module SystemEditor
    class KnowledgeBase
      class << self
        def dsl = load_yaml('dsl.yml')
        def modules = load_yaml('modules.yml')
        def examples = load_yaml('examples.yml')

        private

        def load_yaml(file_name)
          YAML.safe_load(
            File.read(Rails.root.join('app/prompts/llm/system_editor_agent', file_name)),
            aliases: false
          ) || {}
        end
      end
    end
  end
end
