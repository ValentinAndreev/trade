# frozen_string_literal: true

FactoryBot.define do
  factory :preset do
    user
    sequence(:name) { |n| "Preset #{n}" }
    payload { { tabs: [], navPage: 'main' } }
    is_default { false }

    trait :default do
      is_default { true }
    end
  end
end
