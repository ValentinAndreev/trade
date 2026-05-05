# frozen_string_literal: true

require 'digest'
require 'json'

class IndicatorsConfig
  Param = Data.define(:type, :label, :min, :max, :required, :values, :default) do
    def to_schema
      h = { 'type' => type.to_s, 'label' => label }
      h['min']      = min    if min
      h['max']      = max    if max
      h['required'] = true   if required
      h['values']   = values if values && !values.is_a?(Symbol)
      h['default']  = default unless default.nil?
      h
    end

    def coerce!(value, key:)
      case type
      when :integer then Integer(value, exception: false) || raise(ArgumentError, "#{key} must be an integer")
      when :number then Float(value, exception: false) || raise(ArgumentError, "#{key} must be a number")
      when :enum then value.to_s
      else value
      end
    end
  end

  NATIVE_METADATA_KEYS = %i[
    module_version definition_checksum output_fields warmup lookahead
    description formula heuristic ml_feature_eligible
  ].freeze
  private_constant :NATIVE_METADATA_KEYS

  def self.integer(label:, min: nil, max: nil, required: false, default: nil)
    Param.new(type: :integer, label:, min:, max:, required:, values: nil, default:)
  end

  def self.number(label:, min: nil, max: nil, required: false, default: nil)
    Param.new(type: :number, label:, min:, max:, required:, values: nil, default:)
  end

  def self.enum(label:, values:, required: false, default: nil)
    Param.new(type: :enum, label:, min: nil, max: nil, required:, values:, default:)
  end

  def self.param_warmup(param, default:)
    { kind: :param, param:, default: }
  end

  def self.param_warmup_minus_one(param, default:)
    { kind: :param_minus_one, param:, default: }
  end

  def self.max_param_warmup(*rules)
    { kind: :max_params, rules: }
  end

  def self.definition_checksum_for(metadata)
    checksum_input = JSON.generate(
      metadata.slice(
        :module_version,
        :output_fields,
        :warmup,
        :lookahead,
        :formula,
        :heuristic
      )
    )
    Digest::SHA256.hexdigest(checksum_input)
  end
  private_class_method :definition_checksum_for

  def self.native_indicator(label:, params:, warmup:, description:, formula:, heuristic:, output_fields: [ 'value' ], lookahead: 0)
    metadata = {
      module_version: '1',
      output_fields:,
      warmup:,
      lookahead:,
      description:,
      formula:,
      heuristic:,
      ml_feature_eligible: true
    }

    {
      label:,
      params:,
      **metadata,
      definition_checksum: definition_checksum_for(metadata)
    }
  end

  def self.metadata_for(key)
    definition = INDICATORS.fetch(key.to_sym)
    metadata = NATIVE_METADATA_KEYS.each_with_object({}) do |metadata_key, result|
      result[metadata_key] = definition[metadata_key] if definition.key?(metadata_key)
    end
    metadata
  end

  def self.schema_metadata_for(key)
    metadata_for(key).each_with_object({}) do |(metadata_key, value), result|
      result[metadata_key.to_s] = serialize_metadata(value)
    end
  end

  def self.ml_feature_eligible?(key)
    INDICATORS.fetch(key.to_sym).fetch(:ml_feature_eligible, false) == true
  end

  def self.warmup_for(key, params = {})
    definition = INDICATORS.fetch(key.to_sym)
    resolve_warmup(definition[:warmup], params.to_h.transform_keys(&:to_sym))
  end

  def self.serialize_metadata(value)
    case value
    when Hash
      value.each_with_object({}) { |(key, val), result| result[key.to_s] = serialize_metadata(val) }
    when Array
      value.map { |item| serialize_metadata(item) }
    when Symbol
      value.to_s
    else
      value
    end
  end
  private_class_method :serialize_metadata

  def self.resolve_warmup(rule, params)
    case rule
    when Hash
      case rule[:kind].to_s
      when 'param'
        params.fetch(rule.fetch(:param).to_sym, rule.fetch(:default)).to_i
      when 'param_minus_one'
        [ params.fetch(rule.fetch(:param).to_sym, rule.fetch(:default)).to_i - 1, 0 ].max
      when 'max_params'
        rule.fetch(:rules).map { |param_rule| resolve_warmup(param_rule, params) }.max.to_i
      else
        0
      end
    when Integer
      rule
    else
      0
    end
  end
  private_class_method :resolve_warmup

  INDICATORS = {
    adi:    { label: 'Accumulation/Distribution Index', params: {} },
    adtv:   { label: 'Average Daily Trading Volume',    params: { period: integer(label: 'Period', min: 1) } },
    adx:    { label: 'Average Directional Index',       params: { period: integer(label: 'Period', min: 1) } },
    ao:     { label: 'Awesome Oscillator',              params: { short_period: integer(label: 'Short Period', min: 1),
                                                                  long_period:  integer(label: 'Long Period',  min: 1) } },
    atr:    { label: 'Average True Range',              params: { period: integer(label: 'Period', min: 1) } },
    bb:     { label: 'Bollinger Bands',                 params: { period:              integer(label: 'Period',             min: 1),
                                                                  standard_deviations: number(label: 'Standard Deviations', min: 0.1) } },
    cci:    { label: 'Commodity Channel Index',         params: { period:   integer(label: 'Period',   min: 1),
                                                                  constant: number(label: 'Constant', min: 0.001) } },
    cmf:    { label: 'Chaikin Money Flow',              params: { period: integer(label: 'Period', min: 1) } },
    cr:     { label: 'Cumulative Return',               params: {} },
    dc:     { label: 'Donchian Channel',                params: { period: integer(label: 'Period', min: 1) } },
    dlr:    { label: 'Daily Log Return',                params: {} },
    dpo:    { label: 'Detrended Price Oscillator',      params: { period: integer(label: 'Period', min: 1) } },
    dr:     { label: 'Daily Return',                    params: {} },
    ema:    { label: 'Exponential Moving Average',      params: { period: integer(label: 'Period', min: 1) } },
    eom:    { label: 'Ease of Movement',                params: { period: integer(label: 'Period', min: 1) } },
    fi:     { label: 'Force Index',                     params: {} },
    ichimoku: { label: 'Ichimoku Kinko Hyo',            params: { low_period:   integer(label: 'Low Period',    min: 1),
                                                                  medium_period: integer(label: 'Medium Period', min: 1),
                                                                  high_period:   integer(label: 'High Period',   min: 1) } },
    kc:     { label: 'Keltner Channel',                 params: { period: integer(label: 'Period', min: 1) } },
    kst:    { label: 'Know Sure Thing',                 params: { period: integer(label: 'Period', min: 1),
                                                                  roc1:   integer(label: 'ROC 1',   min: 1),
                                                                  roc2:   integer(label: 'ROC 2',   min: 1),
                                                                  roc3:   integer(label: 'ROC 3',   min: 1),
                                                                  roc4:   integer(label: 'ROC 4',   min: 1),
                                                                  sma1:   integer(label: 'SMA 1',   min: 1),
                                                                  sma2:   integer(label: 'SMA 2',   min: 1),
                                                                  sma3:   integer(label: 'SMA 3',   min: 1),
                                                                  sma4:   integer(label: 'SMA 4',   min: 1) } },
    macd:   { label: 'Moving Average Convergence Divergence', params: { fast_period:   integer(label: 'Fast Period',   min: 1),
                                                                        slow_period:   integer(label: 'Slow Period',   min: 1),
                                                                        signal_period: integer(label: 'Signal Period', min: 1) } },
    mfi:    { label: 'Money Flow Index',                params: { period: integer(label: 'Period', min: 1) } },
    mi:     { label: 'Mass Index',                      params: { ema_period: integer(label: 'EMA Period', min: 1),
                                                                  sum_period: integer(label: 'Sum Period',  min: 1) } },
    nvi:    { label: 'Negative Volume Index',           params: {} },
    external_series: { label: 'External Series',        params: { key: enum(label: 'Series key', values: :macro_keys, required: true) } },
    obv:      { label: 'On-balance Volume',             params: {} },
    obv_mean: { label: 'On-balance Volume Mean',        params: { period: integer(label: 'Period', min: 1) } },
    rsi:    { label: 'Relative Strength Index',         params: { period: integer(label: 'Period', min: 1) } },
    log_return: native_indicator(
      label: 'Log Return',
      params: { period: integer(label: 'Period', min: 1, default: 1) },
      warmup: param_warmup(:period, default: 1),
      description: 'Natural-log return between the current close and the close N candles back.',
      formula: 'ln(close[t] / close[t - period])',
      heuristic: 'Stationarizes price movement for ML features without using future candles.'
    ),
    rolling_volatility: native_indicator(
      label: 'Rolling Volatility',
      params: { period: integer(label: 'Period', min: 2, default: 20) },
      warmup: param_warmup(:period, default: 20),
      description: 'Population standard deviation of trailing one-candle log returns.',
      formula: 'stddev_pop(ln(close[i] / close[i - 1]) for i in t - period + 1..t)',
      heuristic: 'Measures recent realized volatility on a candle-aligned return scale.'
    ),
    range_position: native_indicator(
      label: 'Range Position',
      params: { period: integer(label: 'Period', min: 2, default: 20) },
      warmup: param_warmup_minus_one(:period, default: 20),
      description: 'Close location inside the trailing high-low range.',
      formula: '(close[t] - min(low[t - period + 1..t])) / (max(high[t - period + 1..t]) - min(low[t - period + 1..t]))',
      heuristic: 'Normalizes price location to the recent range for regime-aware features.'
    ),
    rolling_zscore: native_indicator(
      label: 'Rolling Z-Score',
      params: { period: integer(label: 'Period', min: 2, default: 20) },
      warmup: param_warmup_minus_one(:period, default: 20),
      description: 'Close price z-score against the trailing close window.',
      formula: '(close[t] - mean(close[t - period + 1..t])) / stddev_pop(close[t - period + 1..t])',
      heuristic: 'Expresses price displacement in local standard-deviation units.'
    ),
    percentile_rank: native_indicator(
      label: 'Percentile Rank',
      params: { period: integer(label: 'Period', min: 2, default: 20) },
      warmup: param_warmup_minus_one(:period, default: 20),
      description: 'Percentile rank of the current close within the trailing close window.',
      formula: 'count(close[i] <= close[t] for i in t - period + 1..t) / period',
      heuristic: 'Compresses local price position to a bounded 0..1 feature.'
    ),
    trend_regime_score: native_indicator(
      label: 'Trend Regime Score',
      params: { period: integer(label: 'Period', min: 2, default: 20) },
      warmup: param_warmup(:period, default: 20),
      description: 'Volatility-adjusted period log return squashed to -1..1.',
      formula: 'tanh(ln(close[t] / close[t - period]) / (rolling_volatility(period)[t] * sqrt(period)))',
      heuristic: 'Captures directional trend strength while reducing volatility-scale bias.'
    ),
    vol_regime_score: native_indicator(
      label: 'Volatility Regime Score',
      params: {
        short_period: integer(label: 'Short Period', min: 2, default: 20),
        long_period: integer(label: 'Long Period', min: 2, default: 100)
      },
      warmup: max_param_warmup(param_warmup(:short_period, default: 20), param_warmup(:long_period, default: 100)),
      description: 'Short-window realized volatility divided by long-window volatility and bounded to 0..1.',
      formula: '(vol(short_period)[t] / vol(long_period)[t]) / (1 + vol(short_period)[t] / vol(long_period)[t])',
      heuristic: 'Identifies whether current volatility is compressed or elevated versus baseline.'
    ),
    vol_adjust: native_indicator(
      label: 'Volatility Adjust',
      params: {
        period: integer(label: 'Period', min: 2, default: 20),
        field: enum(label: 'Field', values: %w[open high low close volume], default: 'close'),
        epsilon: number(label: 'Epsilon', min: 0, default: 0.00000001)
      },
      warmup: param_warmup(:period, default: 20),
      description: 'Selected candle field divided by trailing realized volatility with an epsilon floor.',
      formula: 'field[t] / max(rolling_volatility(period)[t], epsilon)',
      heuristic: 'Normalizes magnitude-like inputs by current realized volatility.'
    ),
    sma:    { label: 'Simple Moving Average',           params: { period: integer(label: 'Period', min: 1) } },
    sr:     { label: 'Stochastic Oscillator',           params: { period:        integer(label: 'Period',        min: 1),
                                                                  signal_period: integer(label: 'Signal Period', min: 1) } },
    trix:   { label: 'Triple Exponential Average',      params: { period: integer(label: 'Period', min: 1) } },
    tsi:    { label: 'True Strength Index',             params: { low_period:  integer(label: 'Low Period',  min: 1),
                                                                  high_period: integer(label: 'High Period', min: 1) } },
    uo:     { label: 'Ultimate Oscillator',             params: { short_period:  integer(label: 'Short Period',  min: 1),
                                                                  medium_period: integer(label: 'Medium Period', min: 1),
                                                                  long_period:   integer(label: 'Long Period',   min: 1),
                                                                  short_weight:  number(label: 'Short Weight',  min: 0),
                                                                  medium_weight: number(label: 'Medium Weight', min: 0),
                                                                  long_weight:   number(label: 'Long Weight',   min: 0) } },
    vi:     { label: 'Vortex Indicator',                params: { period: integer(label: 'Period', min: 1) } },
    vpt:    { label: 'Volume-price Trend',              params: {} },
    vwap:   { label: 'Volume Weighted Average Price',   params: {} },
    wma:    { label: 'Weighted Moving Average',         params: { period: integer(label: 'Period', min: 1) } },
    wr:     { label: 'Williams %R',                     params: { period: integer(label: 'Period', min: 1) } }
  }.freeze

  def self.all = INDICATORS
  def self.indicator_keys = INDICATORS.keys.map(&:to_s)
end
