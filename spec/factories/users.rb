# frozen_string_literal: true

FactoryBot.define do
  factory :user do
    username { Faker::Internet.unique.username(specifier: 3..20) }
    password { 'password123' }
  end
end
