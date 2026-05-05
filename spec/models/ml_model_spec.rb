# frozen_string_literal: true

require 'rails_helper'

RSpec.describe MlModel, type: :model do
  describe 'validations' do
    it 'is valid with default factory attributes' do
      expect(build(:ml_model)).to be_valid
    end

    it 'requires a unique key' do
      create(:ml_model, key: 'btc_direction_v1')

      duplicate = build(:ml_model, key: 'btc_direction_v1')

      expect(duplicate).not_to be_valid
      expect(duplicate.errors[:key]).to be_present
    end

    it 'requires key shape suitable for API/YAML references' do
      model = build(:ml_model, key: 'BTC Direction!')

      expect(model).not_to be_valid
      expect(model.errors[:key]).to be_present
    end

    it 'normalizes model keys to lowercase' do
      model = create(:ml_model, key: ' BTC_DIRECTION_V1 ')

      expect(model.key).to eq('btc_direction_v1')
    end

    it 'requires known serving status' do
      model = build(:ml_model, serving_status: 'unknown')

      expect(model).not_to be_valid
      expect(model.errors[:serving_status]).to be_present
    end

    it 'requires a supported MVP architecture' do
      model = build(:ml_model, architecture: 'lnn')

      expect(model).not_to be_valid
      expect(model.errors[:architecture]).to be_present
    end

    it 'requires a supported MVP prediction target' do
      model = build(:ml_model, prediction_target: 'price_regression')

      expect(model).not_to be_valid
      expect(model.errors[:prediction_target]).to be_present
    end
  end

  describe 'metric summary' do
    it 'stores canonical direction-classification metric keys with nil for unavailable values' do
      model = create(:ml_model, metric_summary: { accuracy: 0.6 })

      expect(model.reload.metric_summary).to eq(
        'accuracy' => 0.6,
        'log_loss' => nil,
        'auc' => nil,
        'baseline_majority' => nil
      )
    end
  end

  describe 'training lifecycle pointers' do
    it 'knows whether it has a trained serving snapshot' do
      model = create(:ml_model)
      expect(model).not_to be_trained

      run = create(:ml_training_run, :succeeded, ml_model: model)
      model.update!(latest_successful_training_run: run, serving_status: 'trained')

      expect(model).to be_trained
    end

    it 'keeps model identity immutable after the first successful training run' do
      model = create(:ml_model, :trained)

      expect(model.update(display_name: 'Renamed model')).to be(false)
      expect(model.errors[:base]).to include(/trained model identity is immutable/)
    end

    it 'allows serving status and failed-run pointer updates after training' do
      model = create(:ml_model, :trained)
      failed_run = create(:ml_training_run, :failed, ml_model: model)

      expect do
        model.update!(serving_status: 'disabled', latest_failed_training_run: failed_run)
      end.to change { model.reload.serving_status }.from('trained').to('disabled')
    end
  end
end
