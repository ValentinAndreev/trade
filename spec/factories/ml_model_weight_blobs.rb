# frozen_string_literal: true

FactoryBot.define do
  factory :ml_model_weight_blob do
    association :ml_training_run, :succeeded
    weights_format { MlModelWeightBlob::BASELINE_FORMAT }
    weights_payload { JSON.generate(coefficients: [ 0.1, -0.2 ], intercept: 0.03) }

    after(:build) do |blob|
      blob.byte_size = blob.payload_bytes
      blob.checksum ||= MlModelWeightBlob.checksum_for(
        training_run: blob.ml_training_run,
        weights_format: blob.weights_format,
        weights_payload: blob.weights_payload
      )
    end
  end
end
