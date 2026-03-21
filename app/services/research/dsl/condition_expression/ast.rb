# frozen_string_literal: true

module Research
  module Dsl
    module ConditionExpression
      module Ast
        module_function

        def each(node, &block)
          return enum_for(__method__, node) unless block

          yield node
          children(node).each { |child| each(child, &block) }
        end

        def children(node)
          case node[:type]
          when :group
            [ node[:expression] ]
          when :logical, :compare, :arithmetic
            [ node[:left], node[:right] ]
          when :unary
            [ node[:expression] ]
          when :call
            Array(node[:args])
          else
            []
          end
        end

        def references(node)
          each(node).each_with_object([]) do |child, refs|
            refs << child[:value] if child[:type] == :reference
          end
        end
      end
    end
  end
end
