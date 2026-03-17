# frozen_string_literal: true

module Research
  module Dsl
    class ValidationContext
      attr_reader :payload, :dictionary, :source_map, :diagnostics

      def initialize(payload:, dictionary:, source_map:)
        @payload = payload
        @dictionary = dictionary
        @source_map = source_map
        @diagnostics = []
      end

      def valid?
        diagnostics.empty?
      end

      def add_error(message:, path:, code:, key_path: nil, suggestion: nil)
        location = if key_path
          source_map&.key_location(key_path, Array(path).last)
        else
          source_map&.value_location(path)
        end
        location ||= { line: 1, column: 1, length: 1 }

        diagnostics << Research::Dsl::Diagnostic.new(
          message: message,
          line: location[:line],
          column: location[:column],
          length: location[:length],
          path: Array(path).join('.'),
          code: code,
          suggestion: suggestion
        )
      end
    end
  end
end
