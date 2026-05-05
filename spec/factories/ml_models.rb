# frozen_string_literal: true

FactoryBot.define do
  factory :ml_model do
    sequence(:key) { |n| "btc_direction_model_#{n}" }
    sequence(:display_name) { |n| "BTC Direction Model #{n}" }
    architecture { 'baseline_direction_classifier' }
    prediction_target { 'direction_classification' }
    serving_status { 'draft' }
    metric_summary { MlModel.canonical_metric_summary }

    trait :trained do
      serving_status { 'trained' }
      serving_weight_checksum { 'sha256-trained-model' }

      after(:create) do |model|
        run = create(:ml_training_run, :succeeded, ml_model: model, weight_checksum: model.serving_weight_checksum)
        model.update!(latest_successful_training_run: run)
      end
    end
  end
end
