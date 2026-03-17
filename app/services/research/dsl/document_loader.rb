# frozen_string_literal: true

module Research
  module Dsl
    class DocumentLoader
      Result = Struct.new(:payload, :source_map, :diagnostics, keyword_init: true) do
        def valid?
          diagnostics.empty?
        end
      end

      def initialize(yaml_text)
        @yaml_text = yaml_text.to_s
      end

      def call
        document = parse_document
        return Result.new(payload: nil, source_map: nil, diagnostics: diagnostics) if document.nil?

        payload = parse_payload
        return Result.new(payload: nil, source_map: nil, diagnostics: diagnostics) if payload.nil?

        Result.new(
          payload: payload,
          source_map: Research::Dsl::SourceMap.build(document),
          diagnostics: diagnostics
        )
      end

      private

      attr_reader :yaml_text

      def diagnostics
        @diagnostics ||= []
      end

      def parse_document
        Psych.parse(yaml_text)
      rescue Psych::SyntaxError => e
        diagnostics << Research::Dsl::Diagnostic.new(
          message: e.problem,
          line: e.line || 1,
          column: e.column || 1,
          length: 1,
          path: nil,
          code: 'yaml_syntax'
        )
        nil
      end

      def parse_payload
        payload = Psych.safe_load(yaml_text, aliases: false)
        return payload if payload.is_a?(Hash)

        diagnostics << Research::Dsl::Diagnostic.new(
          message: 'System YAML must be a mapping',
          line: 1,
          column: 1,
          length: 1,
          path: nil,
          code: 'yaml_root'
        )
        nil
      rescue Psych::Exception => e
        diagnostics << Research::Dsl::Diagnostic.new(
          message: e.message,
          line: 1,
          column: 1,
          length: 1,
          path: nil,
          code: 'yaml_parse'
        )
        nil
      end
    end
  end
end
