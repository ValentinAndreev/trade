# frozen_string_literal: true

module Research
  module Dsl
    Diagnostic = Struct.new(
      :message,
      :line,
      :column,
      :length,
      :path,
      :code,
      :suggestion,
      keyword_init: true
    ) do
      def to_h
        {
          message: message,
          line: line,
          column: column,
          length: length,
          path: path,
          code: code,
          suggestion: suggestion
        }
      end
    end
  end
end
