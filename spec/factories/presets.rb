# frozen_string_literal: true

FactoryBot.define do
  factory :preset do
    user
    sequence(:name) { |n| "Preset #{n}" }
    payload { { tabs: [], navPage: 'main' } }

    trait :default do
      after(:create) do |preset|
        preset.user.update!(default_preset: preset)
      end
    end
  end
end
