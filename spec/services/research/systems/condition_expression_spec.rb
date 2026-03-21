# frozen_string_literal: true

require 'rails_helper'

RSpec.describe Research::Systems::ConditionExpression do
  describe Research::Systems::ConditionExpression::Parser do
    it 'parses arithmetic expressions inside comparisons with precedence' do
      ast = described_class.new('close > ema_fast.value + ema_slow.value / 2').parse

      expect(ast).to include(type: :compare, op: '>')
      expect(ast[:right]).to include(type: :arithmetic, op: '+')
      expect(ast[:right][:right]).to include(type: :arithmetic, op: '/')
    end

    it 'parses helper functions inside comparisons' do
      ast = described_class.new('abs(close - prev(close)) > max(ema.value, offset(close, 2))').parse

      expect(ast).to include(type: :compare, op: '>')
      expect(ast[:left]).to include(type: :call, name: 'abs')
      expect(ast[:right]).to include(type: :call, name: 'max')
    end

    it 'rejects bare arithmetic expressions that do not evaluate to a boolean condition' do
      expect do
        described_class.new('close + ema.value').parse
      end.to raise_error(
        Research::Systems::ConditionExpression::ParseError,
        'Condition expressions must evaluate to a boolean comparison'
      )
    end

    it 'rejects offset with a non-integer second argument' do
      expect do
        described_class.new('close > offset(close, ema.value)').parse
      end.to raise_error(
        Research::Systems::ConditionExpression::ParseError,
        'offset() expects a positive integer literal as the second argument'
      )
    end

    it 'rejects logical expressions with numeric branches' do
      expect do
        described_class.new('close > ema.value && close').parse
      end.to raise_error(
        Research::Systems::ConditionExpression::ParseError,
        'Condition expressions must evaluate to a boolean comparison'
      )
    end

    it 'rejects arithmetic expressions with boolean sub-expressions' do
      expect do
        described_class.new('close > ema.value + (rsi.value > 50)').parse
      end.to raise_error(
        Research::Systems::ConditionExpression::ParseError,
        'Condition expressions must evaluate to a boolean comparison'
      )
    end

    it 'rejects numeric helper functions called with boolean arguments' do
      expect do
        described_class.new('close > abs((rsi.value > 50))').parse
      end.to raise_error(
        Research::Systems::ConditionExpression::ParseError,
        'Condition expressions must evaluate to a boolean comparison'
      )
    end
  end

  describe Research::Systems::ConditionExpression::Evaluator do
    let(:resolver) do
      lambda do |ref, row:, params:, row_offset: 0|
        return params[ref.to_sym] if params.key?(ref.to_sym)

        if row.respond_to?(:fetch_with_offset)
          row.fetch_with_offset(ref.to_sym, row_offset)
        else
          row.fetch(ref.to_sym, nil)
        end
      end
    end

    let(:row_with_history) do
      Class.new do
        def initialize(history)
          @history = history
        end

        def fetch_with_offset(key, row_offset)
          @history.fetch(row_offset, {}).fetch(key, nil)
        end
      end.new([
        { close: 12.0, 'ema.value': 8.0, 'slow.value': 11.0 },
        { close: 10.0, 'ema.value': 7.0, 'slow.value': 9.0 },
        { close: 9.0, 'ema.value': 6.0, 'slow.value': 8.0 }
      ])
    end

    def evaluate(expression, row:, prev_row: nil, params: {})
      ast = Research::Systems::ConditionExpression::Parser.new(expression).parse
      described_class.new(ast, resolver:).call(row:, prev_row:, params:)
    end

    it 'evaluates arithmetic on the right side of a comparison' do
      row = {
        close: 215.0,
        'ema_fast.value': 220.0,
        'ema_slow.value': 120.0
      }

      expect(evaluate('ema_fast.value > ema_slow.value + 50', row:)).to be(true)
    end

    it 'supports unary minus in arithmetic expressions' do
      row = { close: 2.0, 'ema.value': 4.0 }

      expect(evaluate('close > -(ema.value - 5)', row:)).to be(true)
    end

    it 'evaluates abs/min/max helper functions' do
      row = { close: 12.0, 'ema.value': 8.0, 'slow.value': 11.0 }

      expect(evaluate('abs(close - ema.value) >= min(4, max(2, slow.value - ema.value))', row:)).to be(true)
    end

    it 'evaluates prev and offset helper functions against prior bars' do
      expect(evaluate('close > prev(close)', row: row_with_history)).to be(true)
      expect(evaluate('offset(close, 2) < ema.value', row: row_with_history)).to be(false)
      expect(evaluate('max(prev(close), offset(close, 2)) < close', row: row_with_history)).to be(true)
    end

    it 'returns false when offset points before available history' do
      expect(evaluate('close > offset(close, 10)', row: row_with_history)).to be(false)
    end

    it 'returns false when arithmetic encounters nil operands' do
      row = { close: 10.0 }

      expect(evaluate('close > ema.value + 5', row:)).to be(false)
    end

    it 'returns false when arithmetic division hits zero' do
      row = { close: 10.0, 'ema.value': 5.0 }

      expect(evaluate('close > ema.value / 0', row:)).to be(false)
    end

    it 'handles crossover comparisons when previous values are zero' do
      row = { 'ema_fast.value': 1.0, 'ema_slow.value': 0.0 }
      prev_row = { 'ema_fast.value': 0.0, 'ema_slow.value': 0.0 }

      expect(evaluate('ema_fast.value >> ema_slow.value', row:, prev_row:)).to be(true)
    end
  end
end
