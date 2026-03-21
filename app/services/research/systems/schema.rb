# frozen_string_literal: true

module Research
  module Systems
    module Schema
      module_function

      def data
        @data ||= YAML.safe_load(
          File.read(Rails.root.join('config/research/dictionary.yml')),
          aliases: false
        )
      end
    end
  end
end
