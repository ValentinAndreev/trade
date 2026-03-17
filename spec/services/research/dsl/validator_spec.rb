# frozen_string_literal: true

require 'rails_helper'

RSpec.describe Research::Dsl::Validator do
  describe '#call' do
    it 'returns diagnostics with source location for unknown keys' do
      yaml = <<~YAML
        id: bad
        name: Broken
        module:
          type: ema
          params:
            period: 20
        params:
          position_mode: long_short
        conditions:
          long_entry:
            operator: cross_above
            left: close
            right: module.value
        unexpected: true
      YAML

      result = described_class.new(yaml).call

      expect(result).to be_invalid
      expect(result.diagnostics.first.to_h).to include(
        message: 'Unknown key: unexpected',
        line: 14,
        column: 1
      )
    end
  end
end
