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

    it 'requires a succeeded training run' do
      run = create(:ml_training_run, status: 'queued')
      blob = build(:ml_model_weight_blob, ml_training_run: run)

      expect(blob).not_to be_valid
      expect(blob.errors[:ml_training_run]).to be_present
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
      expect(blob.errors[:checksum]).to include('does not match canonical training run snapshot')
    end

    it 'allows only one blob per training run' do
      run = create(:ml_training_run, :succeeded)
      create(:ml_model_weight_blob, ml_training_run: run)

      duplicate = build(:ml_model_weight_blob, ml_training_run: run)

      expect(duplicate).not_to be_valid
      expect(duplicate.errors[:ml_training_run_id]).to be_present
    end
  end

  describe 'persistence' do
    it 'stores and reloads durable weights without going through the model list path' do
      blob = create(:ml_model_weight_blob)

      reloaded = described_class.find(blob.id)

      expect(reloaded.weights_payload).to eq(blob.weights_payload)
      expect(reloaded.byte_size).to eq(blob.weights_payload.bytesize)
      expect(reloaded.ml_training_run.ml_model).to eq(blob.ml_training_run.ml_model)
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
