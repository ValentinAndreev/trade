# frozen_string_literal: true

require 'rails_helper'

RSpec.describe Llm::ProviderCatalog do
  describe '.runtime_provider' do
    it 'uses the OpenAI-compatible runtime for llama.cpp' do
      expect(described_class.runtime_provider('llama')).to eq('openai')
    end
  end

  describe '.suggestions' do
    it 'does not expose OpenAI catalog suggestions for llama.cpp' do
      model = double(provider: 'openai', supports_functions?: true, id: 'gpt-4.1-mini')
      allow(RubyLLM).to receive(:models).and_return(double(all: [ model ]))

      expect(described_class.suggestions('llama')).to eq([])
    end
  end

  describe '.api_key_required?' do
    it 'does not require API keys for local OpenAI-compatible endpoints' do
      expect(described_class.api_key_required?('openai', 'http://127.0.0.1:8080/v1')).to eq(false)
    end
  end
end
