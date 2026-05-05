# frozen_string_literal: true

module Ml
  class Predictor
    def initialize(weight_blob: nil, training_run: nil, weights_format: nil, weights_payload: nil,
      adapter: Ml::Adapters::BaselineDirectionClassifier.new)
      @weight_blob = weight_blob || training_run&.weight_blob
      @weights_format = weights_format || @weight_blob&.weights_format
      @weights_payload = weights_payload || @weight_blob&.weights_payload
      @adapter = adapter
    end

    def predict(features:)
      return failure(:missing_weights, 'model weights are not available') if weights_payload.blank?
      return failure(:retrain_required, "unsupported weights format: #{weights_format}") unless weights_format == MlModelWeightBlob::BASELINE_FORMAT

      adapter.predict(features:, weights: weights_payload)
    end

    private

    attr_reader :weights_format, :weights_payload, :adapter

    def failure(code, message, details = {})
      Ml::Adapters::Result::PredictionBatch.new(
        status: :failed,
        predictions: [],
        error: Ml::Adapters::Result::Error.new(code:, message:, details:)
      )
    end
  end
end
