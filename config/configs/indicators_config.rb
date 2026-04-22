# frozen_string_literal: true

class IndicatorsConfig
  Param = Data.define(:type, :label, :min, :max, :required, :values) do
    def to_schema
      h = { 'type' => type.to_s, 'label' => label }
      h['min']      = min    if min
      h['max']      = max    if max
      h['required'] = true   if required
      h['values']   = values if values && !values.is_a?(Symbol)
      h
    end
  end

  def self.integer(label:, min: nil, max: nil, required: false)
    Param.new(type: :integer, label:, min:, max:, required:, values: nil)
  end

  def self.number(label:, min: nil, max: nil, required: false)
    Param.new(type: :number, label:, min:, max:, required:, values: nil)
  end

  def self.enum(label:, values:, required: false)
    Param.new(type: :enum, label:, min: nil, max: nil, required:, values:)
  end

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
