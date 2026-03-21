# frozen_string_literal: true

module Research
  module Dsl
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

        OPERATORS = %w[&& || << >> <= >= + - * / < > ( ) ,].freeze
        FUNCTIONS = %w[abs min max prev offset].freeze

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
          raise ParseError.new('Condition expression must evaluate to a boolean comparison', offset: 0, length: text.length) unless expression_kind(node) == :boolean

          node
        end

        private

        attr_reader :text, :tokens
        attr_accessor :index

        def parse_or
          left = parse_and
          while match?(:operator, "||")
            op = previous_token
            right = parse_and
            left = { type: :logical, op: op.value, left: left, right: right }
          end
          left
        end

        def parse_and
          left = parse_comparison
          while match?(:operator, "&&")
            op = previous_token
            right = parse_comparison
            left = { type: :logical, op: op.value, left: left, right: right }
          end
          left
        end

        def parse_comparison
          left = parse_additive
          return left unless match?(:operator, "<<", ">>", "<", ">", "<=", ">=")

          op = previous_token
          right = parse_additive
          { type: :compare, op: op.value, left: left, right: right }
        end

        def parse_additive
          left = parse_multiplicative
          while match?(:operator, "+", "-")
            op = previous_token
            right = parse_multiplicative
            left = { type: :arithmetic, op: op.value, left: left, right: right }
          end
          left
        end

        def parse_multiplicative
          left = parse_unary
          while match?(:operator, "*", "/")
            op = previous_token
            right = parse_unary
            left = { type: :arithmetic, op: op.value, left: left, right: right }
          end
          left
        end

        def parse_unary
          return parse_primary unless match?(:operator, "-")

          { type: :unary, op: previous_token.value, expression: parse_unary }
        end

        def parse_primary
          token = current_token
          raise ParseError.new('Unexpected end of condition expression', offset: text.length) unless token

          if match?(:operator, "(")
            expr = parse_or
            closing = current_token
            raise ParseError.new('Expected closing parenthesis', offset: text.length) unless match?(:operator, ")")

            return { type: :group, expression: expr, offset: token.offset, length: closing ? closing.offset + closing.length - token.offset : 1 }
          end

          if match?(:number)
            return { type: :number, value: previous_token.value.to_f }
          end

          if token.type == :reference
            return parse_reference_or_call
          end

          raise ParseError.new("Unexpected token: #{token.value}", offset: token.offset, length: token.length)
        end

        def parse_reference_or_call
          token = current_token
          advance_token

          return { type: :reference, value: token.value } unless current_token&.type == :operator && current_token.value == "("

          raise ParseError.new("Unsupported function: #{token.value}", offset: token.offset, length: token.length) unless FUNCTIONS.include?(token.value)

          advance_token
          args = parse_call_arguments
          validate_call!(token, args)

          { type: :call, name: token.value, args: args }
        end

        def parse_call_arguments
          args = []
          return args if match?(:operator, ")")

          loop do
            args << parse_additive
            return args if match?(:operator, ")")

            token = current_token
            raise ParseError.new('Expected comma or closing parenthesis', offset: text.length) unless match?(:operator, ",")
            raise ParseError.new('Expected expression after comma', offset: token.offset, length: token.length) unless current_token
          end
        end

        def validate_call!(token, args)
          case token.value
          when "abs", "prev"
            return if args.length == 1

            raise ParseError.new("#{token.value}() expects exactly 1 argument", offset: token.offset, length: token.length)
          when "min", "max"
            return if args.length >= 2

            raise ParseError.new("#{token.value}() expects at least 2 arguments", offset: token.offset, length: token.length)
          when "offset"
            raise ParseError.new('offset() expects exactly 2 arguments', offset: token.offset, length: token.length) unless args.length == 2
            return if positive_integer_literal?(args[1])

            raise ParseError.new('offset() expects a positive integer literal as the second argument', offset: token.offset, length: token.length)
          end
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

        def expression_kind(node)
          case node[:type]
          when :group
            expression_kind(node[:expression])
          when :logical
            left_kind = expression_kind(node[:left])
            right_kind = expression_kind(node[:right])
            left_kind == :boolean && right_kind == :boolean ? :boolean : nil
          when :compare
            left_kind = expression_kind(node[:left])
            right_kind = expression_kind(node[:right])
            left_kind == :numeric && right_kind == :numeric ? :boolean : nil
          when :number, :reference
            :numeric
          when :unary
            expression_kind(node[:expression]) == :numeric ? :numeric : nil
          when :arithmetic
            left_kind = expression_kind(node[:left])
            right_kind = expression_kind(node[:right])
            left_kind == :numeric && right_kind == :numeric ? :numeric : nil
          when :call
            call_expression_kind(node)
          else
            nil
          end
        end

        def positive_integer_literal?(node)
          node[:type] == :number && node[:value].positive? && node[:value].to_i == node[:value]
        end

        def call_expression_kind(node)
          case node[:name]
          when "abs", "prev"
            expression_kind(node[:args][0]) == :numeric ? :numeric : nil
          when "min", "max"
            node[:args].all? { |arg| expression_kind(arg) == :numeric } ? :numeric : nil
          when "offset"
            expression_kind(node[:args][0]) == :numeric && expression_kind(node[:args][1]) == :numeric ? :numeric : nil
          else
            nil
          end
        end
      end
    end
  end
end
