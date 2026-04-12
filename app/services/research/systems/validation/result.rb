# frozen_string_literal: true

module Research
  module Systems
    module Validation
      class Result
        attr_reader :compiled, :diagnostics

        def initialize(compiled: nil, diagnostics: [])
          @compiled = compiled
          @diagnostics = diagnostics
        end

        def valid? = diagnostics.empty? && !compiled.nil?
        def invalid? = !valid?
        def metadata = compiled&.metadata

        def raise_if_invalid!
          return self if valid?

          raise Error.new(diagnostics.presence || [ Diagnostic.yaml_missing ])
        end
      end
    end
  end
end
