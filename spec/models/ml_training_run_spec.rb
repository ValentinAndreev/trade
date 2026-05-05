# frozen_string_literal: true

require 'rails_helper'

RSpec.describe MlTrainingRun, type: :model do
  describe 'validations' do
    it 'is valid with default factory attributes' do
      expect(build(:ml_training_run)).to be_valid
    end

    it 'requires known status' do
      run = build(:ml_training_run, status: 'paused')

      expect(run).not_to be_valid
      expect(run.errors[:status]).to be_present
    end

    it 'normalizes metrics to canonical direction-classification keys' do
      run = create(:ml_training_run, metrics: { accuracy: 0.7 })

      expect(run.reload.metrics).to eq(
        'accuracy' => 0.7,
        'log_loss' => nil,
        'auc' => nil,
        'baseline_majority' => nil
      )
    end

    it 'requires a weight checksum for succeeded runs' do
      run = build(:ml_training_run, status: 'succeeded', weight_checksum: nil)

      expect(run).not_to be_valid
      expect(run.errors[:weight_checksum]).to be_present
    end

    it 'rejects final weights on cancelled runs' do
      run = build(:ml_training_run, status: 'cancelled', weight_checksum: 'sha256-cancelled')

      expect(run).not_to be_valid
      expect(run.errors[:weight_checksum]).to be_present
    end

    it 'rejects a second active run for the same model at the service validation layer' do
      model = create(:ml_model)
      create(:ml_training_run, ml_model: model, status: 'queued')

      duplicate = build(:ml_training_run, ml_model: model, status: 'running')

      expect(duplicate).not_to be_valid
      expect(duplicate.errors[:ml_model_id]).to include('already has an active training run')
    end

    it 'allows terminal runs when an active run exists' do
      model = create(:ml_model)
      create(:ml_training_run, ml_model: model, status: 'queued')

      terminal = build(:ml_training_run, :failed, ml_model: model)

      expect(terminal).to be_valid
    end
  end

  describe 'database constraints' do
    it 'enforces one active training run per model with a partial unique index' do
      model = create(:ml_model)
      now = Time.current
      attrs = {
        ml_model_id: model.id,
        status: 'queued',
        dataset_spec: { exchange: 'bitfinex' },
        resolved_feature_spec: [],
        hyperparams: {},
        seed: 0,
        metrics: MlTrainingRun.canonical_metrics,
        error_metadata: {},
        fitted_metadata: {},
        created_at: now,
        updated_at: now
      }

      described_class.insert_all!([ attrs ])

      expect do
        described_class.insert_all!([ attrs.merge(status: 'running', created_at: now + 1.second, updated_at: now + 1.second) ])
      end.to raise_error(ActiveRecord::RecordNotUnique)
    end
  end

  describe 'cancellation' do
    it 'records a persisted cancellation request for running runs' do
      run = create(:ml_training_run, :running)

      expect { run.request_cancellation! }
        .to change { run.reload.cancellation_requested_at }
        .from(nil)

      expect(run).to be_cancellation_requested
      expect(run.status).to eq('running')
    end

    it 'cancels queued runs immediately' do
      run = create(:ml_training_run, status: 'queued')

      expect { run.request_cancellation! }
        .to change { run.reload.status }
        .from('queued')
        .to('cancelled')

      expect(run.cancellation_requested_at).to be_present
      expect(run.finished_at).to be_present
      expect(run.error_metadata).to include('code' => 'cancelled')
    end

    it 'does not mark terminal runs as cancellation requested' do
      run = create(:ml_training_run, :succeeded)

      expect(run.request_cancellation!).to be(false)
      expect(run.reload.cancellation_requested_at).to be_nil
    end

    it 'does not let a stale queued instance overwrite a terminal run' do
      run = create(:ml_training_run, status: 'queued')
      stale_instance = described_class.find(run.id)
      run.update!(status: 'succeeded', weight_checksum: 'a' * 64)

      expect(stale_instance.request_cancellation!).to be(false)

      expect(run.reload.status).to eq('succeeded')
      expect(run.weight_checksum).to eq('a' * 64)
    end
  end
end
