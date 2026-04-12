# frozen_string_literal: true

module Research
  module Systems
    module Validation
      Diagnostic = Struct.new(:message, :line, :column, :length, :path, :code, keyword_init: true) do
        def self.yaml_missing
          new(message: 'System YAML is required', line: 1, column: 1, length: 1, code: 'yaml_missing')
        end
      end
    end
  end
end
