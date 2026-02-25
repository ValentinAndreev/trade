# frozen_string_literal: true

class Candle::IndicatorCalculator
  INDICATORS = {
    sma: TechnicalAnalysis::Sma,
    ema: TechnicalAnalysis::Ema,
    rsi: TechnicalAnalysis::Rsi,
    macd: TechnicalAnalysis::Macd,
    bb: TechnicalAnalysis::Bb,
    adx: TechnicalAnalysis::Adx,
    atr: TechnicalAnalysis::Atr,
    cci: TechnicalAnalysis::Cci,
    mfi: TechnicalAnalysis::Mfi,
    obv: TechnicalAnalysis::Obv,
    vwap: TechnicalAnalysis::Vwap,
    sr: TechnicalAnalysis::Sr,
    ichimoku: TechnicalAnalysis::Ichimoku
  }.freeze

  class UnknownIndicatorError < StandardError; end

  private attr_reader :candles

  def initialize(candles)
    @candles = candles
  end

  def calculate(indicator, **params)
    klass = INDICATORS.fetch(indicator.to_sym) do
      raise UnknownIndicatorError, "Unknown indicator: #{indicator}. Available: #{INDICATORS.keys.join(', ')}"
    end

    results = klass.calculate(input_data, **build_params(klass, params))
    results.map(&:to_hash)
  end

  def self.available
    INDICATORS.map do |key, klass|
      {
        key: key,
        name: klass.indicator_name,
        options: klass.valid_options,
        min_data: klass.min_data_size
      }
    end
  end

  private

  def input_data
    @input_data ||= candles.map do |c|
      {
        date_time: Time.at(c[:time]).utc.iso8601,
        open: c[:open], high: c[:high],
        low: c[:low], close: c[:close],
        volume: c[:volume]
      }
    end
  end

  def build_params(klass, params)
    valid = klass.valid_options
    filtered = params.select { |k, _| valid.include?(k.to_sym) }
    filtered.transform_values { |v| v.is_a?(String) ? (v.match?(/\A\d+\z/) ? v.to_i : v.to_f) : v }
  end
end
