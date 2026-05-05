# frozen_string_literal: true

require 'rails_helper'

RSpec.describe Research::Modules::MlSignal do
  let(:candles) do
    Array.new(3) do |index|
      {
        time: Time.utc(2026, 1, 1, 0, index).to_i,
        open: 100.0 + index,
        high: 101.0 + index,
        low: 99.0 + index,
        close: 100.5 + index,
        volume: 10.0 + index
      }
    end
  end

  it 'returns candle-aligned ml_signal values from inference service' do
    inference_result = Ml::InferenceService::Result.new(
      status: :succeeded,
      model: nil,
      snapshot: nil,
      series: candles.map { |candle| { time: candle.fetch(:time), values: { 'confidence' => 0.42 } } },
      diagnostics: {},
      error: nil
    )
    service = instance_double(Ml::InferenceService, call: inference_result)

    allow(Ml::InferenceService).to receive(:new).with(
      model_key: 'btc_direction_v1',
      symbol: 'BTCUSD',
      timeframe: '1m',
      exchange: 'bitfinex',
      candles:,
      outputs: [ 'confidence' ],
      cancel_check: nil
    ).and_return(service)

    result = described_class.new(candles:, symbol: 'BTCUSD', timeframe: '1m', exchange: 'bitfinex')
      .call(model_key: 'btc_direction_v1', output: 'confidence')

    expect(result).to eq(candles.map { |candle| { time: candle.fetch(:time), result: { value: 0.42 } } })
  end

  it 'passes the research cancellation context into inference' do
    cancel_check = -> { false }
    inference_result = Ml::InferenceService::Result.new(
      status: :succeeded,
      model: nil,
      snapshot: nil,
      series: [],
      diagnostics: {},
      error: nil
    )
    service = instance_double(Ml::InferenceService, call: inference_result)

    allow(Ml::InferenceService).to receive(:new).and_return(service)

    described_class.new(candles:, symbol: 'BTCUSD', timeframe: '1m')
      .call(model_key: 'btc_direction_v1', cancel_check:)

    expect(Ml::InferenceService).to have_received(:new).with(hash_including(cancel_check:))
  end

  it 'raises a structured module error when inference fails' do
    inference_error = Ml::InferenceService::Error.new(
      code: :adapter_unavailable,
      message: 'adapter offline',
      details: { reason: 'maintenance' }
    )
    service = instance_double(
      Ml::InferenceService,
      call: Ml::InferenceService::Result.new(
        status: :failed,
        model: nil,
        snapshot: nil,
        series: [],
        diagnostics: {},
        error: inference_error
      )
    )
    allow(Ml::InferenceService).to receive(:new).and_return(service)

    expect do
      described_class.new(candles:, symbol: 'BTCUSD', timeframe: '1m')
        .call(model_key: 'btc_direction_v1')
    end.to raise_error(Research::Modules::MlSignal::Error) do |error|
      expect(error.code).to eq(:adapter_unavailable)
      expect(error.details).to eq(reason: 'maintenance')
    end
  end
end
