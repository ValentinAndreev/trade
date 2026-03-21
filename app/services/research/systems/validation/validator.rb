# frozen_string_literal: true

module Research
  module Systems
    module Validation
      class Validator
        include Checks::Structure
        include Checks::Conditions
        include Checks::Optimization

        def initialize(yaml_text)
          @yaml_text = yaml_text.to_s
          @diagnostics = []
        end

        def call
          return Result.new(diagnostics: @diagnostics) unless parse_document
          return Result.new(diagnostics: @diagnostics) unless parse_payload

          @schema = Research::Systems::Schema.data

          validate_structure
          validate_conditions
          validate_optimization

          compiled = Research::Systems::Definition.new(@payload, schema: @schema) if @diagnostics.empty?
          Result.new(compiled: compiled, diagnostics: @diagnostics)
        end

        private

        def parse_document
          doc = Psych.parse(@yaml_text)
          if doc == false || doc.nil?
            @diagnostics << Diagnostic.yaml_missing
            return false
          end

          @document = doc
          true
        rescue Psych::SyntaxError => e
          @diagnostics << Diagnostic.new(
            message: e.problem, line: e.line || 1, column: e.column || 1, length: 1, code: 'yaml_syntax'
          )
          false
        end

        def parse_payload
          root = @document&.root
          unless root
            @diagnostics << Diagnostic.yaml_missing
            return false
          end

          class_loader = Psych::ClassLoader::Restricted.new([], [])
          scanner = Psych::ScalarScanner.new(class_loader)
          visitor = Psych::Visitors::NoAliasRuby.new(scanner, class_loader)
          payload = visitor.accept(root)

          if payload.is_a?(Hash)
            @payload = payload
            return true
          end

          @diagnostics << Diagnostic.new(
            message: 'System YAML must be a mapping', line: 1, column: 1, length: 1, code: 'yaml_root'
          )
          false
        rescue Psych::Exception => e
          @diagnostics << Diagnostic.new(message: e.message, line: 1, column: 1, length: 1, code: 'yaml_parse')
          false
        end

        def source_map
          @source_map ||= SourceMap.build(@document)
        end

        def add_error(message:, path:, code:, key_path: nil)
          location = if key_path
            source_map.key_location(key_path, Array(path).last)
          else
            source_map.value_location(path)
          end
          location ||= { line: 1, column: 1, length: 1 }

          @diagnostics << Diagnostic.new(
            message: message,
            line: location[:line],
            column: location[:column],
            length: location[:length],
            path: Array(path).join('.'),
            code: code
          )
        end

        def add_expression_error(message:, path:, offset:, length:, code:)
          location = source_map.value_location_for_offset(path, offset, length) || { line: 1, column: 1, length: 1 }

          @diagnostics << Diagnostic.new(
            message: message,
            line: location[:line],
            column: location[:column],
            length: location[:length],
            path: Array(path).join('.'),
            code: code
          )
        end

        def numeric_like?(value)
          Float(value) && true
        rescue ArgumentError, TypeError
          false
        end

        def integer_like?(value)
          Integer(value) && true
        rescue ArgumentError, TypeError
          false
        end

        def validate_unknown_keys(path, actual_keys, allowed_keys)
          actual_keys.map(&:to_s).each do |key|
            next if allowed_keys.map(&:to_s).include?(key)

            add_error(message: "Unknown key: #{key}", path: path + [ key ], key_path: path, code: 'unknown_key')
          end
        end
      end
    end
  end
end
