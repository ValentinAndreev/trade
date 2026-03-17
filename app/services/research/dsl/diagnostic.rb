# frozen_string_literal: true

module Research
  module Dsl
    Diagnostic = Struct.new(:message, :line, :column, :length, :path, :code, keyword_init: true) do
      def self.yaml_missing
        new(message: 'System YAML is required', line: 1, column: 1, length: 1, code: 'yaml_missing')
      end

      def to_h
        { message: message, line: line, column: column, length: length, path: path, code: code }
      end
    end
  end
end
