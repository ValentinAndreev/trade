# frozen_string_literal: true

FactoryBot.define do
  factory :candle do
    symbol { 'BTCUSD' }
    exchange { 'bitfinex' }
    timeframe { '1m' }
    sequence(:ts) { |n| Time.utc(2026, 1, 1) + n.minutes }
    open { 50_000.0 + rand(1000.0) }
    high { (open || 50_500.0) + rand(500.0) }
    low { (open || 50_500.0) - rand(500.0) }
    close { 50_000.0 + rand(1000.0) }
    volume { rand(10.0..500.0).round(4) }
  end
end
