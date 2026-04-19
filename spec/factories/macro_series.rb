# frozen_string_literal: true

FactoryBot.define do
  factory :macro_series do
    sequence(:ts) { |n| Time.utc(2026, 1, 1) + n.days }
    source { 'yahoo' }
    indicator { 'dxy' }
    value { 100.0 + rand(10.0) }
  end
end
