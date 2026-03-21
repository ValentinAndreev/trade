# frozen_string_literal: true

module Research
  module Systems
    module Validation
      class SourceMap
        def self.build(document)
          new(document&.root)
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

        def initialize(root = nil)
          @key_nodes = {}
          @value_nodes = {}
          visit(root, []) if root
        end

        def visit(node, path)
          case node
          when Psych::Nodes::Mapping
            children = node.children
            (0...children.length).step(2) do |index|
              key_node = children[index]
              value_node = children[index + 1]
              next unless key_node.is_a?(Psych::Nodes::Scalar)

              key = key_node.value.to_s
              child_path = path + [ key ]
              @key_nodes[path_key(child_path)] = key_node
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

          start_line = node.start_line.to_i + 1
          start_column = node.start_column.to_i + 1
          end_column = node.respond_to?(:end_column) ? node.end_column.to_i : node.start_column.to_i
          length = if node.respond_to?(:end_line) && node.end_line.to_i == node.start_line.to_i
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
