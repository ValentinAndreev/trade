# frozen_string_literal: true

require 'rails_helper'

RSpec.describe Llm::SystemEditor::ChatRunner do
  describe '.suggest_title' do
    it 'uses the prompt text as-is for the title' do
      expect(described_class.suggest_title('simple ema cross')).to eq('simple ema cross')
    end

    it 'collapses whitespace before truncation' do
      content = <<~TEXT
        fix exits in
        trend system
      TEXT

      expect(described_class.suggest_title(content)).to eq('fix exits in trend system')
    end

    it 'falls back to New chat when the message is empty' do
      expect(described_class.suggest_title(" \n\t ")).to eq('New chat')
    end
  end
end
