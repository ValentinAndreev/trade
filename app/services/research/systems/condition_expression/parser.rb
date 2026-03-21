# frozen_string_literal: true

module Research
  module Systems
    module ConditionExpression
      class ParseError < StandardError
        attr_reader :offset, :length

        def initialize(message, offset:, length: 1)
          super(message)
          @offset = offset
          @length = length
        end
      end

      class Parser
        Token = Struct.new(:type, :value, :offset, :length, keyword_init: true)

        OPERATORS = (Definition.binary_operator_symbols.sort_by { |operator| -operator.length } + %w[( ) ,]).freeze
        def initialize(text)
          @text = text.to_s
          @tokens = tokenize
          @index = 0
        end

        def parse
          raise ParseError.new('Condition expression is required', offset: 0) if @text.strip.empty?

          node = parse_or
          token = current_token
          raise ParseError.new("Unexpected token: #{token.value}", offset: token.offset, length: token.length) if token
          raise ParseError.new(Definition::ROOT_REQUIREMENT, offset: 0, length: text.length) unless expression_kind(node) == :boolean

          node
        end

        private

        attr_reader :text, :tokens
        attr_accessor :index

        def parse_or
          parse_binary_chain(%w[||], :logical) { parse_and }
        end

        def parse_and
          parse_binary_chain(%w[&&], :logical) { parse_comparison }
        end

        def parse_comparison
          parse_binary_chain(%w[<< >> < > <= >=], :compare, repeatable: false) { parse_additive }
        end

        def parse_additive
          parse_binary_chain(%w[+ -], :arithmetic) { parse_multiplicative }
        end

        def parse_multiplicative
          parse_binary_chain(%w[* /], :arithmetic) { parse_unary }
        end

        def parse_unary
          return parse_primary unless match?(:operator, '-')

          { type: :unary, op: previous_token.value, expression: parse_unary }
        end

        def parse_primary
          token = current_token
          raise ParseError.new('Unexpected end of condition expression', offset: text.length) unless token

          parse_group || parse_number || parse_reference_or_call || raise_unexpected_token(token)
        end

        def parse_reference_or_call
          token = current_token
          return unless token&.type == :reference

          advance_token

          current_token&.type == :operator && current_token.value == '(' ? parse_call(token) : { type: :reference, value: token.value }
        end

        def parse_group
          opening = current_token
          return unless match?(:operator, '(')

          expr = parse_or
          closing = current_token
          raise ParseError.new('Expected closing parenthesis', offset: text.length) unless match?(:operator, ')')

          {
            type: :group,
            expression: expr,
            offset: opening.offset,
            length: closing ? closing.offset + closing.length - opening.offset : 1
          }
        end

        def parse_number
          return unless match?(:number)

          { type: :number, value: previous_token.value.to_f }
        end

        def parse_call(token)
          function = Definition.function_definition(token.value)
          raise ParseError.new("Unsupported function: #{token.value}", offset: token.offset, length: token.length) unless function

          advance_token
          args = parse_call_arguments
          validate_call_arity(token, args, function)
          validate_positive_integer_literal_arguments(token, args, function)

          { type: :call, name: token.value, args: args }
        end

        def parse_call_arguments
          args = []
          return args if match?(:operator, ')')

          loop do
            args << parse_additive
            return args if match?(:operator, ')')

            token = current_token
            raise ParseError.new('Expected comma or closing parenthesis', offset: text.length) unless match?(:operator, ',')
            raise ParseError.new('Expected expression after comma', offset: token.offset, length: token.length) unless current_token
          end
        end

        def validate_call_arity(token, args, function)
          min_args = function.fetch(:min_args)
          max_args = function.fetch(:max_args)
          return if args.length >= min_args && (max_args.nil? || args.length <= max_args)

          raise ParseError.new(Definition.arity_error_message(function), offset: token.offset, length: token.length)
        end

        def validate_positive_integer_literal_arguments(token, args, function)
          positive_integer_literal_indexes = function.fetch(:positive_integer_literal_indexes)
          return if positive_integer_literal_indexes.all? { |index| positive_integer_literal?(args[index]) }

          raise ParseError.new(
            Definition.positive_integer_literal_error_message(function, positive_integer_literal_indexes.first),
            offset: token.offset,
            length: token.length
          )
        end

        def parse_binary_chain(operators, node_type, repeatable: true)
          left = yield
          return left unless match?(:operator, *operators)

          loop do
            left = build_binary_node(node_type, previous_token.value, left, yield)
            break unless repeatable && match?(:operator, *operators)
          end

          left
        end

        def build_binary_node(type, op, left, right)
          { type: type, op: op, left: left, right: right }
        end

        def tokenize
          tokens = []
          pos = 0

          while pos < text.length
            char = text[pos]

            if char.match?(/\s/)
              pos += 1
              next
            end

            operator = OPERATORS.find { |candidate| text.byteslice(pos, candidate.length) == candidate }
            if operator
              tokens << Token.new(type: :operator, value: operator, offset: pos, length: operator.length)
              pos += operator.length
              next
            end

            number_match = text[pos..].match(/\A\d+(?:\.\d+)?/)
            if number_match
              value = number_match[0]
              tokens << Token.new(type: :number, value: value, offset: pos, length: value.length)
              pos += value.length
              next
            end

            reference_match = text[pos..].match(/\A[a-z_][a-z0-9_.]*/i)
            if reference_match
              value = reference_match[0]
              tokens << Token.new(type: :reference, value: value, offset: pos, length: value.length)
              pos += value.length
              next
            end

            raise ParseError.new("Unexpected token: #{char}", offset: pos)
          end

          tokens
        end

        def match?(type, *values)
          token = current_token
          return false unless token&.type == type
          return advance_token if values.empty?
          return false unless values.include?(token.value)

          advance_token
        end

        def advance_token
          self.index += 1
          true
        end

        def current_token
          tokens[index]
        end

        def previous_token
          tokens[index - 1]
        end

        def raise_unexpected_token(token)
          raise ParseError.new("Unexpected token: #{token.value}", offset: token.offset, length: token.length)
        end

        def expression_kind(node)
          case node[:type]
          when :group
            expression_kind(Ast.children(node).first)
          when :logical
            binary_expression_kind(node, expected: :boolean, result: :boolean)
          when :compare
            binary_expression_kind(node, expected: :numeric, result: :boolean)
          when :number, :reference
            :numeric
          when :unary
            expression_kind(Ast.children(node).first) == :numeric ? :numeric : nil
          when :arithmetic
            binary_expression_kind(node, expected: :numeric, result: :numeric)
          when :call
            call_expression_kind(node)
          else
            nil
          end
        end

        def binary_expression_kind(node, expected:, result:)
          child_kinds = Ast.children(node).map { |child| expression_kind(child) }
          child_kinds.all?(expected) ? result : nil
        end

        def positive_integer_literal?(node)
          node[:type] == :number && node[:value].positive? && node[:value].to_i == node[:value]
        end

        def call_expression_kind(node)
          function = Definition.function_definition(node[:name])
          return unless function&.fetch(:numeric_arguments)
          return unless Ast.children(node).all? { |arg| expression_kind(arg) == :numeric }

          function.fetch(:return_kind)
        end
      end
    end
  end
end
