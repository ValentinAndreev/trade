# frozen_string_literal: true

module Research
  module Dsl
    class ValidationResult
      attr_reader :compiled, :diagnostics

      def initialize(compiled: nil, diagnostics: [])
        @compiled = compiled
        @diagnostics = diagnostics
      end

      def valid?
        diagnostics.empty?
      end

      def invalid?
        !valid?
      end

      def metadata
        compiled&.metadata
      end

      def raise_if_invalid!
        return self if valid?

        raise Research::Dsl::ValidationError.new(diagnostics)
      end
    end
  end
end
