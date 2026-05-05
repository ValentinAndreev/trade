# frozen_string_literal: true

require 'rails_helper'

RSpec.describe MlModelWeightBlob, type: :model do
  describe 'validations' do
    it 'is valid with default factory attributes' do
      expect(build(:ml_model_weight_blob)).to be_valid
    end

    it 'requires a supported weights format' do
      blob = build(:ml_model_weight_blob, weights_format: 'unknown:v1')

      expect(blob).not_to be_valid
      expect(blob.errors[:weights_format]).to be_present
    end

    it 'enforces the 16 MB payload cap' do
      payload = 'x' * (described_class::MAX_BYTE_SIZE + 1)
      blob = build(:ml_model_weight_blob, weights_payload: payload)

      expect(blob).not_to be_valid
      expect(blob.errors[:byte_size]).to be_present
    end

    it 'rejects a mismatched checksum' do
      blob = build(:ml_model_weight_blob, checksum: 'bad-checksum')

      expect(blob).not_to be_valid
      expect(blob.errors[:checksum]).to include('must be a SHA-256 hex digest')
    end

    it 'deduplicates deterministic retrain payloads by checksum' do
      payload = JSON.generate(coefficients: [ 1.0 ])
      first_run = create(:ml_training_run, :succeeded)
      second_run = create(
        :ml_training_run,
        :succeeded,
        dataset_spec: first_run.dataset_spec,
        resolved_feature_spec: first_run.resolved_feature_spec,
        hyperparams: first_run.hyperparams,
        seed: first_run.seed,
        fitted_metadata: first_run.fitted_metadata
      )

      first = create(:ml_model_weight_blob, ml_training_run: first_run, weights_payload: payload)
      second = build(:ml_model_weight_blob, ml_training_run: second_run, weights_payload: payload, checksum: first.checksum)

      expect(second).to be_valid
      expect { second.save! }.to raise_error(ActiveRecord::RecordNotUnique)
      expect(described_class.where(checksum: first.checksum).count).to eq(1)
    end
  end

  describe 'persistence' do
    it 'stores and reloads durable weights without going through the model list path' do
      blob = create(:ml_model_weight_blob)

      reloaded = described_class.find(blob.id)

      expect(reloaded.weights_payload).to eq(blob.weights_payload)
      expect(reloaded.byte_size).to eq(blob.weights_payload.bytesize)
      expect(reloaded.checksum).to eq(blob.checksum)
    end
  end

  describe '.checksum_for' do
    it 'changes when the resolved feature snapshot changes' do
      payload = JSON.generate(coefficients: [ 1.0 ])
      first_run = create(:ml_training_run, :succeeded, resolved_feature_spec: [ { key: 'log_return', checksum: 'v1' } ])
      second_run = create(:ml_training_run, :succeeded, resolved_feature_spec: [ { key: 'log_return', checksum: 'v2' } ])

      first = described_class.checksum_for(
        training_run: first_run,
        weights_format: described_class::BASELINE_FORMAT,
        weights_payload: payload
      )
      second = described_class.checksum_for(
        training_run: second_run,
        weights_format: described_class::BASELINE_FORMAT,
        weights_payload: payload
      )

      expect(first).not_to eq(second)
    end
  end
end
