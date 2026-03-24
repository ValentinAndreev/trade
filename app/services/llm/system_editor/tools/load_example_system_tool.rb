# frozen_string_literal: true

module Llm
  module SystemEditor
    module Tools
      class LoadExampleSystemTool < RubyLLM::Tool
        description 'Load one of the bundled example systems by id or relative path.'

        param :identifier, desc: 'Example system id or relative path'

        def name = 'load_example_system'

        def execute(identifier:)
          entry = Research::Systems::Catalog.find_by_relative_path(identifier.to_s) || Research::Systems::Catalog.find(identifier.to_s)
          return { error: "Unknown example system: #{identifier}" } unless entry

          {
            id: entry.id,
            name: entry.name,
            relative_path: entry.relative_path,
            yaml: entry.yaml
          }
        end
      end
    end
  end
end
