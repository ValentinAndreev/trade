# frozen_string_literal: true

module Llm
  module SystemEditor
    class KnowledgeBase
      class << self
        def dsl
          load_yaml('dsl.yml')
        end

        def modules
          load_yaml('modules.yml')
        end

        def examples
          load_yaml('examples.yml')
        end

        private

        def load_yaml(file_name)
          YAML.safe_load(
            File.read(Rails.root.join('config/llm/system_editor', file_name)),
            aliases: false
          ) || {}
        end
      end
    end
  end
end
