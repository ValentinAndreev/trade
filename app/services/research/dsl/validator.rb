# frozen_string_literal: true

module Research
  module Dsl
    class Validator
      VALIDATORS = [
        Research::Dsl::Validators::RootValidator,
        Research::Dsl::Validators::ModuleValidator,
        Research::Dsl::Validators::ParamsValidator,
        Research::Dsl::Validators::ConditionsValidator,
        Research::Dsl::Validators::OptimizationValidator
      ].freeze

      def initialize(yaml_text)
        @yaml_text = yaml_text.to_s
      end

      def call
        loaded_document = Research::Dsl::DocumentLoader.new(yaml_text).call
        return Research::Dsl::ValidationResult.new(diagnostics: loaded_document.diagnostics) unless loaded_document.valid?

        context = Research::Dsl::ValidationContext.new(
          payload: loaded_document.payload,
          dictionary: Research::Dsl::Catalog.dictionary,
          source_map: loaded_document.source_map
        )

        VALIDATORS.each { |validator| validator.validate(context) }

        compiled = if context.valid?
          Research::Dsl::Compiler.new(dictionary: context.dictionary).compile(context.payload)
        end

        Research::Dsl::ValidationResult.new(compiled: compiled, diagnostics: context.diagnostics)
      end

      private

      attr_reader :yaml_text
    end
  end
end
