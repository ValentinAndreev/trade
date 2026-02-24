export const INDICATOR_META = {
  sma: {
    fields: [{ key: "sma", label: "SMA" }],
    defaults: { period: 20 },
    paramLabels: { period: "Period" },
  },
  ema: {
    fields: [{ key: "ema", label: "EMA" }],
    defaults: { period: 20 },
    paramLabels: { period: "Period" },
  },
  rsi: {
    fields: [{ key: "rsi", label: "RSI" }],
    defaults: { period: 14 },
    paramLabels: { period: "Period" },
  },
  macd: {
    fields: [
      { key: "macd_line", label: "MACD" },
      { key: "signal_line", label: "Signal" },
      { key: "macd_histogram", label: "Histogram", seriesType: "Histogram" },
    ],
    defaults: { fast_period: 12, slow_period: 26, signal_period: 9 },
    paramLabels: { fast_period: "Fast", slow_period: "Slow", signal_period: "Signal" },
  },
  bb: {
    fields: [
      { key: "upper_band", label: "Upper" },
      { key: "middle_band", label: "Middle" },
      { key: "lower_band", label: "Lower" },
    ],
    defaults: { period: 20, standard_deviations: 2 },
    paramLabels: { period: "Period", standard_deviations: "Std Dev" },
  },
  adx: {
    fields: [
      { key: "adx", label: "ADX" },
      { key: "di_pos", label: "+DI" },
      { key: "di_neg", label: "-DI" },
    ],
    defaults: { period: 14 },
    paramLabels: { period: "Period" },
  },
  atr: {
    fields: [{ key: "atr", label: "ATR" }],
    defaults: { period: 14 },
    paramLabels: { period: "Period" },
  },
  cci: {
    fields: [{ key: "cci", label: "CCI" }],
    defaults: { period: 20 },
    paramLabels: { period: "Period" },
  },
  mfi: {
    fields: [{ key: "mfi", label: "MFI" }],
    defaults: { period: 14 },
    paramLabels: { period: "Period" },
  },
  vwap: {
    fields: [{ key: "vwap", label: "VWAP" }],
    defaults: {},
    paramLabels: {},
  },
  sr: {
    fields: [
      { key: "sr", label: "SR" },
      { key: "sr_signal", label: "SR Signal" },
    ],
    defaults: { period: 14 },
    paramLabels: { period: "Period" },
  },
  ichimoku: {
    fields: [
      { key: "tenkan_sen", label: "Tenkan" },
      { key: "kijun_sen", label: "Kijun" },
      { key: "senkou_span_a", label: "Senkou A" },
      { key: "senkou_span_b", label: "Senkou B" },
      { key: "chikou_span", label: "Chikou" },
    ],
    defaults: { conversion_period: 9, base_period: 26, lagging_span_period: 52 },
    paramLabels: { conversion_period: "Conversion", base_period: "Base", lagging_span_period: "Lagging" },
  },
}
