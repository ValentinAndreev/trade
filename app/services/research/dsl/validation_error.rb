# frozen_string_literal: true

module Research
  module Dsl
    class ValidationError < StandardError
      attr_reader :diagnostics

      def initialize(diagnostics)
        @diagnostics = Array(diagnostics)
        super(@diagnostics.first&.message || 'Invalid research system YAML')
      end
    end
  end
end
