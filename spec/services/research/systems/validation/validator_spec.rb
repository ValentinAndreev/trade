# frozen_string_literal: true

require 'rails_helper'

RSpec.describe Research::Systems::Validation::Validator do
  describe '#call' do
    it 'treats empty yaml as invalid' do
      result = described_class.new('').call

      expect(result).to be_invalid
      expect(result.diagnostics.first.to_h).to include(
        message: 'System YAML is required',
        code: 'yaml_missing'
      )
    end

    it 'returns diagnostics with source location for unknown keys' do
      yaml = <<~YAML
        id: bad
        name: Broken
        modules:
          ema:
            type: ema
            period: 20
        params:
          position_mode: long_short
        conditions:
          long_entry: "close >> ema.value"
        unexpected: true
      YAML

      result = described_class.new(yaml).call

      expect(result).to be_invalid
      expect(result.diagnostics.first.to_h).to include(
        message: 'Unknown key: unexpected',
        line: 11,
        column: 1
      )
    end

    it 'rejects unsupported module types' do
      yaml = <<~YAML
        id: bad
        name: Broken
        modules:
          fast:
            type: wave
            period: 20
        conditions:
          long_entry: "close >> fast.value"
      YAML

      result = described_class.new(yaml).call

      expect(result).to be_invalid
      expect(result.diagnostics.map(&:message)).to include('Unsupported module type: wave')
    end

    it 'requires type for every module alias' do
      yaml = <<~YAML
        id: bad
        name: Broken
        modules:
          ema_fast:
            period: 10
          ema_slow:
            type: ema
            period: 20
        conditions:
          long_entry: "ema_fast.value >> ema_slow.value"
      YAML

      result = described_class.new(yaml).call

      expect(result).to be_invalid
      expect(result.diagnostics.map(&:message)).to include('Missing required key: type')
    end

    it 'validates references nested inside arithmetic expressions' do
      yaml = <<~YAML
        id: bad
        name: Broken
        modules:
          ema_fast:
            type: ema
            period: 10
        params:
          position_mode: long_short
        conditions:
          long_entry: "close > ema_fast.value + missing.value"
      YAML

      result = described_class.new(yaml).call

      expect(result).to be_invalid
      expect(result.diagnostics.map(&:message)).to include('Unknown module reference: missing.value')
    end

    it 'validates references nested inside helper function calls' do
      yaml = <<~YAML
        id: bad
        name: Broken
        modules:
          ema_fast:
            type: ema
            period: 10
        params:
          position_mode: long_short
        conditions:
          long_entry: "abs(offset(missing.value, 2) - ema_fast.value) > 5"
      YAML

      result = described_class.new(yaml).call

      expect(result).to be_invalid
      expect(result.diagnostics.map(&:message)).to include('Unknown module reference: missing.value')
    end

    it 'rejects condition expressions with non-boolean logical branches' do
      yaml = <<~YAML
        id: bad
        name: Broken
        modules:
          ema_fast:
            type: ema
            period: 10
        params:
          position_mode: long_short
        conditions:
          long_entry: "close > ema_fast.value && close"
      YAML

      result = described_class.new(yaml).call

      expect(result).to be_invalid
      expect(result.diagnostics.map(&:message)).to include('Condition expressions must evaluate to a boolean comparison')
    end
  end
end
