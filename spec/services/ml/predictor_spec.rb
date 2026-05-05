# frozen_string_literal: true

require 'rails_helper'

RSpec.describe Ml::Predictor do
  let(:adapter) { Ml::Adapters::BaselineDirectionClassifier.new }
  let(:training) do
    adapter.train(
      examples: [
        { features: { 'x' => -2.0 }, label: 'down' },
        { features: { 'x' => 2.0 }, label: 'up' }
      ],
      hyperparams: { max_iterations: 30, tolerance: 0.0 }
    )
  end

  describe '#predict' do
    it 'loads baseline weights from a weight blob' do
      blob = create(:ml_model_weight_blob, weights_payload: training.weights_payload)

      batch = described_class.new(weight_blob: blob).predict(features: [ { 'x' => 2.0 } ])

      expect(batch).to be_success
      expect(batch.predictions.first).to include(direction: 'up')
    end

    it 'rejects unknown formats with a retrain-required error' do
      batch = described_class.new(weights_format: 'unknown:v1', weights_payload: '{}')
        .predict(features: [ { 'x' => 2.0 } ])

      expect(batch).not_to be_success
      expect(batch.error.code).to eq(:retrain_required)
    end

    it 'rejects missing weights as a structured error' do
      batch = described_class.new.predict(features: [ { 'x' => 2.0 } ])

      expect(batch).not_to be_success
      expect(batch.error.code).to eq(:missing_weights)
    end
  end
end
