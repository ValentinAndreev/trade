# frozen_string_literal: true

require 'rails_helper'

RSpec.describe Ml::Adapters::BaselineDirectionClassifier do
  class AdapterCallbackSpy
    attr_reader :checks, :events

    def initialize
      @checks = 0
      @events = []
    end

    def check_cancelled!
      @checks += 1
    end

    def report_progress(**payload)
      @events << payload
    end
  end

  let(:examples) do
    [
      { features: { 'x' => -2.0 }, label: 'down' },
      { features: { 'x' => -1.0 }, label: 'down' },
      { features: { 'x' => 1.0 }, label: 'up' },
      { features: { 'x' => 2.0 }, label: 'up' }
    ]
  end

  subject(:adapter) { described_class.new }

  describe '#train' do
    it 'trains deterministic baseline weights with canonical metrics' do
      first = adapter.train(examples:, hyperparams: { max_iterations: 80, tolerance: 0.0 })
      second = adapter.train(examples:, hyperparams: { max_iterations: 80, tolerance: 0.0 })

      expect(first).to be_success
      expect(first.weights_format).to eq(MlModelWeightBlob::BASELINE_FORMAT)
      expect(first.weights_payload).to eq(second.weights_payload)
      expect(first.weights_payload.bytesize).to be < 64.kilobytes
      expect(first.metrics.keys).to eq(MlModel::CANONICAL_METRIC_KEYS)
      expect(first.metrics.fetch('accuracy')).to eq(1.0)
      expect(first.metrics.fetch('baseline_majority')).to eq(0.5)
      expect(first.fitted_metadata).to include('feature_names' => [ 'x' ])
    end

    it 'uses balanced class weights and reports structured insufficient-class failures' do
      result = adapter.train(
        examples: examples.take(2),
        hyperparams: { class_weight: 'balanced' }
      )

      expect(result).not_to be_success
      expect(result.error.code).to eq(:insufficient_classes)
      expect(result.metrics.keys).to eq(MlModel::CANONICAL_METRIC_KEYS)
    end

    it 'calls cancellation and progress callbacks during training' do
      callbacks = AdapterCallbackSpy.new

      result = adapter.train(examples:, hyperparams: { max_iterations: 5, tolerance: 0.0 }, callbacks:)

      expect(result).to be_success
      expect(callbacks.checks).to be > 1
      expect(callbacks.events.last).to include(stage: 'training', iteration: 5, max_iterations: 5)
    end
  end

  describe '#predict' do
    it 'returns probability, direction and confidence for feature batches' do
      training = adapter.train(examples:, hyperparams: { max_iterations: 80, tolerance: 0.0 })

      batch = adapter.predict(
        features: [ { 'x' => -3.0 }, { 'x' => 3.0 }, { 'x' => nil } ],
        weights: training.weights_payload
      )

      expect(batch).to be_success
      expect(batch.predictions.first).to include(direction: 'down')
      expect(batch.predictions.second).to include(direction: 'up')
      expect(batch.predictions.second.fetch(:probability)).to be > 0.5
      expect(batch.predictions.third).to eq(probability: nil, direction: nil, confidence: nil)
    end

    it 'rejects incompatible weight payloads as structured prediction failures' do
      batch = adapter.predict(features: [ { 'x' => 1.0 } ], weights: { 'weights_format' => 'other:v1' })

      expect(batch).not_to be_success
      expect(batch.error.code).to eq(:unsupported_weights_format)
    end
  end
end
