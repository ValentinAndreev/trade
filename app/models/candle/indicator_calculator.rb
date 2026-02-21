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
    format_results(results)
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
    @input_data ||= candles.ordered.map do |c|
      {
        date_time: c.ts.iso8601,
        open: c.open.to_f,
        high: c.high.to_f,
        low: c.low.to_f,
        close: c.close.to_f,
        volume: c.volume.to_f
      }
    end
  end

  def build_params(klass, params)
    valid = klass.valid_options
    filtered = params.select { |k, _| valid.include?(k.to_sym) }
    # Use :close as default price_key for single-price indicators
    filtered[:price_key] = :close if valid.include?(:price_key) && !filtered.key?(:price_key)
    filtered.transform_values { |v| v.is_a?(String) ? (v.match?(/\A\d+\z/) ? v.to_i : v.to_f) : v }
  end

  def format_results(results)
    results.map(&:to_hash)
  end
end
