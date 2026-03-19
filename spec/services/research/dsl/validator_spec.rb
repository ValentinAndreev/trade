# frozen_string_literal: true

require 'rails_helper'

RSpec.describe Research::Dsl::Validator do
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
        line: 10,
        column: 1
      )
    end

    it 'rejects unsupported module keys' do
      yaml = <<~YAML
        id: bad
        name: Broken
        modules:
          fast:
            period: 20
        conditions:
          long_entry: "close >> ema.value"
      YAML

      result = described_class.new(yaml).call

      expect(result).to be_invalid
      expect(result.diagnostics.map(&:message)).to include('Unsupported module: fast')
    end
  end
end
