# frozen_string_literal: true

module Research
  module Dsl
    class Validator
      include Validators::Structure
      include Validators::Conditions
      include Validators::Optimization

      def initialize(yaml_text)
        @yaml_text   = yaml_text.to_s
        @diagnostics = []
      end

      def call
        document = parse_document
        return ValidationResult.new(diagnostics: @diagnostics) unless document

        @payload    = parse_payload
        return ValidationResult.new(diagnostics: @diagnostics) unless @payload

        @source_map = SourceMap.build(document)
        @dictionary = Catalog.dictionary

        validate_structure
        validate_conditions
        validate_optimization

        compiled = Research::System.new(@payload, dictionary: @dictionary) if @diagnostics.empty?
        ValidationResult.new(compiled: compiled, diagnostics: @diagnostics)
      end

      private

      # --- YAML parsing ---

      def parse_document
        document = Psych.parse(@yaml_text)
        return document unless document == false || document.nil?

        @diagnostics << Diagnostic.yaml_missing
        nil
      rescue Psych::SyntaxError => e
        @diagnostics << Diagnostic.new(
          message: e.problem, line: e.line || 1, column: e.column || 1, length: 1, code: 'yaml_syntax'
        )
        nil
      end

      def parse_payload
        payload = Psych.safe_load(@yaml_text, aliases: false)
        return payload if payload.is_a?(Hash)

        @diagnostics << Diagnostic.new(
          message: 'System YAML must be a mapping', line: 1, column: 1, length: 1, code: 'yaml_root'
        )
        nil
      rescue Psych::Exception => e
        @diagnostics << Diagnostic.new(message: e.message, line: 1, column: 1, length: 1, code: 'yaml_parse')
        nil
      end

      # --- Error recording ---

      def add_error(message:, path:, code:, key_path: nil)
        location = if key_path
          @source_map&.key_location(key_path, Array(path).last)
        else
          @source_map&.value_location(path)
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
        location = @source_map&.value_location_for_offset(path, offset, length) || { line: 1, column: 1, length: 1 }

        @diagnostics << Diagnostic.new(
          message: message,
          line: location[:line],
          column: location[:column],
          length: location[:length],
          path: Array(path).join('.'),
          code: code
        )
      end

      # --- Shared type helpers (used by all validator modules) ---

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

      # --- Shared key validation (used by all validator modules) ---

      def validate_unknown_keys(path, actual_keys, allowed_keys)
        actual_keys.map(&:to_s).each do |key|
          next if allowed_keys.map(&:to_s).include?(key)

          add_error(message: "Unknown key: #{key}", path: path + [ key ], key_path: path, code: 'unknown_key')
        end
      end

      # --- Source map (maps YAML paths to line/column for editor diagnostics) ---

      class SourceMap
        def self.build(document)
          return new unless document&.root

          new.tap { |map| map.send(:visit, document.root, []) }
        end

        def key_location(path, key)
          location_for(@key_nodes[path_key(path + [ key.to_s ])])
        end

        def value_location(path)
          location_for(@value_nodes[path_key(path)])
        end

        def value_location_for_offset(path, offset, length = 1)
          node = @value_nodes[path_key(path)]
          return fallback_location unless node&.respond_to?(:value)

          line_offset, column_offset = offset_position(node.value.to_s, offset)
          base_column = line_offset.zero? ? node.start_column.to_i + 1 : 1

          {
            line: node.start_line.to_i + 1 + line_offset,
            column: base_column + column_offset,
            length: [ length.to_i, 1 ].max
          }
        end

        private

        def initialize
          @key_nodes   = {}
          @value_nodes = {}
        end

        def visit(node, path)
          case node
          when Psych::Nodes::Mapping
            children = node.children
            (0...children.length).step(2) do |index|
              key_node   = children[index]
              value_node = children[index + 1]
              next unless key_node.is_a?(Psych::Nodes::Scalar)

              key        = key_node.value.to_s
              child_path = path + [ key ]
              @key_nodes[path_key(child_path)]   = key_node
              @value_nodes[path_key(child_path)] = value_node if value_node
              visit(value_node, child_path) if value_node
            end
          when Psych::Nodes::Sequence
            node.children.each_with_index do |child, index|
              child_path = path + [ index.to_s ]
              @value_nodes[path_key(child_path)] = child
              visit(child, child_path)
            end
          end
        end

        def path_key(path)
          Array(path).map(&:to_s).join("\u0000")
        end

        def location_for(node)
          return fallback_location unless node&.respond_to?(:start_line)

          start_line   = node.start_line.to_i + 1
          start_column = node.start_column.to_i + 1
          end_column   = node.respond_to?(:end_column) ? node.end_column.to_i : node.start_column.to_i
          length       = if node.respond_to?(:end_line) && node.end_line.to_i == node.start_line.to_i
            [ end_column - node.start_column.to_i, 1 ].max
          else
            1
          end

          { line: start_line, column: start_column, length: length }
        end

        def offset_position(value, offset)
          safe_offset = [ [ offset.to_i, 0 ].max, value.length ].min
          prefix = value[0, safe_offset]
          parts = prefix.split("\n", -1)

          [ parts.length - 1, parts.last.to_s.length ]
        end

        def fallback_location
          { line: 1, column: 1, length: 1 }
        end
      end
    end
  end
end
