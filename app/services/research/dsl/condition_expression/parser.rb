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

        OPERATORS = %w[&& || << >> <= >= < > ( )].freeze

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
          left = parse_primary
          return left unless match?(:operator, "<<", ">>", "<", ">", "<=", ">=")

          op = previous_token
          right = parse_primary
          { type: :compare, op: op.value, left: left, right: right }
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

          if match?(:reference)
            return { type: :reference, value: previous_token.value }
          end

          raise ParseError.new("Unexpected token: #{token.value}", offset: token.offset, length: token.length)
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

            number_match = text[pos..].match(/\A-?\d+(?:\.\d+)?/)
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
      end
    end
  end
end
