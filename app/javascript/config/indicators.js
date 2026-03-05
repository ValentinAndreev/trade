import {
  SMA, EMA, WMA, WEMA,
  RSI, BollingerBands, MACD,
  ADX, ATR, CCI,
  Stochastic, StochasticRSI, WilliamsR,
  ROC, TRIX, KST,
  AwesomeOscillator, PSAR,
  KeltnerChannels, ChandelierExit,
  MFI, OBV, VWAP, ForceIndex, ADL,
  SD,
  IchimokuCloud,
} from "technicalindicators"

// requires: "values" — single value series (close, volume, etc.)
//           "ohlc"   — needs high/low/close arrays
//           "ohlcv"  — needs high/low/close/volume arrays
// lib.input receives (sourceData, params) where sourceData = [{time, open, high, low, close, volume, value}, ...]

const v = (d) => d.map(x => x.value)
const hi = (d) => d.map(x => x.high)
const lo = (d) => d.map(x => x.low)
const cl = (d) => d.map(x => x.close)
const vol = (d) => d.map(x => x.volume)

export const INDICATOR_META = {
  // --- Moving Averages ---
  sma: {
    label: "SMA", requires: "values", overlay: true,
    fields: [{ key: "sma", label: "SMA" }],
    defaults: { period: 20 },
    paramLabels: { period: "Period" },
    lib: {
      fn: (i) => SMA.calculate(i),
      input: (d, p) => ({ period: p.period || 20, values: v(d) }),
      map: r => ({ sma: r }),
    },
  },
  ema: {
    label: "EMA", requires: "values", overlay: true,
    fields: [{ key: "ema", label: "EMA" }],
    defaults: { period: 20 },
    paramLabels: { period: "Period" },
    lib: {
      fn: (i) => EMA.calculate(i),
      input: (d, p) => ({ period: p.period || 20, values: v(d) }),
      map: r => ({ ema: r }),
    },
  },
  wma: {
    label: "WMA", requires: "values", overlay: true,
    fields: [{ key: "wma", label: "WMA" }],
    defaults: { period: 20 },
    paramLabels: { period: "Period" },
    lib: {
      fn: (i) => WMA.calculate(i),
      input: (d, p) => ({ period: p.period || 20, values: v(d) }),
      map: r => ({ wma: r }),
    },
  },
  wema: {
    label: "WEMA", requires: "values", overlay: true,
    fields: [{ key: "wema", label: "WEMA" }],
    defaults: { period: 20 },
    paramLabels: { period: "Period" },
    lib: {
      fn: (i) => WEMA.calculate(i),
      input: (d, p) => ({ period: p.period || 20, values: v(d) }),
      map: r => ({ wema: r }),
    },
  },

  // --- Oscillators (values-only) ---
  rsi: {
    label: "RSI", requires: "values",
    fields: [{ key: "rsi", label: "RSI" }],
    defaults: { period: 14 },
    paramLabels: { period: "Period" },
    lib: {
      fn: (i) => RSI.calculate(i),
      input: (d, p) => ({ period: p.period || 14, values: v(d) }),
      map: r => ({ rsi: r }),
    },
  },
  macd: {
    label: "MACD", requires: "values",
    fields: [
      { key: "macd_line", label: "MACD" },
      { key: "signal_line", label: "Signal" },
      { key: "macd_histogram", label: "Histogram", seriesType: "Histogram" },
    ],
    defaults: { fast_period: 12, slow_period: 26, signal_period: 9 },
    paramLabels: { fast_period: "Fast", slow_period: "Slow", signal_period: "Signal" },
    lib: {
      fn: (i) => MACD.calculate(i),
      input: (d, p) => ({
        values: v(d),
        fastPeriod: p.fast_period || 12,
        slowPeriod: p.slow_period || 26,
        signalPeriod: p.signal_period || 9,
        SimpleMAOscillator: false,
        SimpleMASignal: false,
      }),
      map: r => ({ macd_line: r.MACD ?? null, signal_line: r.signal ?? null, macd_histogram: r.histogram ?? null }),
    },
  },
  stochastic_rsi: {
    label: "Stochastic RSI", requires: "values",
    fields: [
      { key: "stoch_rsi", label: "StochRSI" },
      { key: "k", label: "%K" },
      { key: "d", label: "%D" },
    ],
    defaults: { rsi_period: 14, stochastic_period: 14, k_period: 3, d_period: 3 },
    paramLabels: { rsi_period: "RSI", stochastic_period: "Stoch", k_period: "%K", d_period: "%D" },
    lib: {
      fn: (i) => StochasticRSI.calculate(i),
      input: (d, p) => ({
        values: v(d),
        rsiPeriod: p.rsi_period || 14,
        stochasticPeriod: p.stochastic_period || 14,
        kPeriod: p.k_period || 3,
        dPeriod: p.d_period || 3,
      }),
      map: r => ({ stoch_rsi: r.stochRSI ?? null, k: r.k ?? null, d: r.d ?? null }),
    },
  },
  roc: {
    label: "ROC", requires: "values",
    fields: [{ key: "roc", label: "ROC" }],
    defaults: { period: 12 },
    paramLabels: { period: "Period" },
    lib: {
      fn: (i) => ROC.calculate(i),
      input: (d, p) => ({ period: p.period || 12, values: v(d) }),
      map: r => ({ roc: r }),
    },
  },
  trix: {
    label: "TRIX", requires: "values",
    fields: [{ key: "trix", label: "TRIX" }],
    defaults: { period: 18 },
    paramLabels: { period: "Period" },
    lib: {
      fn: (i) => TRIX.calculate(i),
      input: (d, p) => ({ period: p.period || 18, values: v(d) }),
      map: r => ({ trix: r }),
    },
  },
  kst: {
    label: "KST", requires: "values",
    fields: [
      { key: "kst", label: "KST" },
      { key: "signal", label: "Signal" },
    ],
    defaults: {
      roc1: 10, roc2: 15, roc3: 20, roc4: 30,
      sma1: 10, sma2: 10, sma3: 10, sma4: 15,
      signal_period: 9,
    },
    paramLabels: {
      roc1: "ROC1", roc2: "ROC2", roc3: "ROC3", roc4: "ROC4",
      sma1: "SMA1", sma2: "SMA2", sma3: "SMA3", sma4: "SMA4",
      signal_period: "Signal",
    },
    lib: {
      fn: (i) => KST.calculate(i),
      input: (d, p) => ({
        values: v(d),
        ROCPer1: p.roc1 || 10, ROCPer2: p.roc2 || 15,
        ROCPer3: p.roc3 || 20, ROCPer4: p.roc4 || 30,
        SMAROCPer1: p.sma1 || 10, SMAROCPer2: p.sma2 || 10,
        SMAROCPer3: p.sma3 || 10, SMAROCPer4: p.sma4 || 15,
        signalPeriod: p.signal_period || 9,
      }),
      map: r => ({ kst: r.kst ?? null, signal: r.signal ?? null }),
    },
  },

  // --- Volatility (values-only) ---
  bb: {
    label: "Bollinger Bands", requires: "values", overlay: true,
    fields: [
      { key: "upper_band", label: "Upper" },
      { key: "middle_band", label: "Middle" },
      { key: "lower_band", label: "Lower" },
    ],
    defaults: { period: 20, standard_deviations: 2 },
    paramLabels: { period: "Period", standard_deviations: "Std Dev" },
    lib: {
      fn: (i) => BollingerBands.calculate(i),
      input: (d, p) => ({ period: p.period || 20, stdDev: p.standard_deviations || 2, values: v(d) }),
      map: r => ({ upper_band: r.upper, middle_band: r.middle, lower_band: r.lower }),
    },
  },
  sd: {
    label: "Std Deviation", requires: "values",
    fields: [{ key: "sd", label: "SD" }],
    defaults: { period: 20 },
    paramLabels: { period: "Period" },
    lib: {
      fn: (i) => SD.calculate(i),
      input: (d, p) => ({ period: p.period || 20, values: v(d) }),
      map: r => ({ sd: r }),
    },
  },

  // --- OHLC indicators ---
  adx: {
    label: "ADX", requires: "ohlc",
    fields: [
      { key: "adx", label: "ADX" },
      { key: "di_pos", label: "+DI" },
      { key: "di_neg", label: "-DI" },
    ],
    defaults: { period: 14 },
    paramLabels: { period: "Period" },
    lib: {
      fn: (i) => ADX.calculate(i),
      input: (d, p) => ({ high: hi(d), low: lo(d), close: cl(d), period: p.period || 14 }),
      map: r => ({ adx: r.adx ?? null, di_pos: r.pdi ?? null, di_neg: r.mdi ?? null }),
    },
  },
  atr: {
    label: "ATR", requires: "ohlc",
    fields: [{ key: "atr", label: "ATR" }],
    defaults: { period: 14 },
    paramLabels: { period: "Period" },
    lib: {
      fn: (i) => ATR.calculate(i),
      input: (d, p) => ({ high: hi(d), low: lo(d), close: cl(d), period: p.period || 14 }),
      map: r => ({ atr: r }),
    },
  },
  cci: {
    label: "CCI", requires: "ohlc",
    fields: [{ key: "cci", label: "CCI" }],
    defaults: { period: 20 },
    paramLabels: { period: "Period" },
    lib: {
      fn: (i) => CCI.calculate(i),
      input: (d, p) => ({ high: hi(d), low: lo(d), close: cl(d), period: p.period || 20 }),
      map: r => ({ cci: r }),
    },
  },
  stochastic: {
    label: "Stochastic", requires: "ohlc",
    fields: [
      { key: "k", label: "%K" },
      { key: "d", label: "%D" },
    ],
    defaults: { period: 14, signal_period: 3 },
    paramLabels: { period: "Period", signal_period: "Signal" },
    lib: {
      fn: (i) => Stochastic.calculate(i),
      input: (d, p) => ({ high: hi(d), low: lo(d), close: cl(d), period: p.period || 14, signalPeriod: p.signal_period || 3 }),
      map: r => ({ k: r.k ?? null, d: r.d ?? null }),
    },
  },
  williams_r: {
    label: "Williams %R", requires: "ohlc",
    fields: [{ key: "williams_r", label: "%R" }],
    defaults: { period: 14 },
    paramLabels: { period: "Period" },
    lib: {
      fn: (i) => WilliamsR.calculate(i),
      input: (d, p) => ({ high: hi(d), low: lo(d), close: cl(d), period: p.period || 14 }),
      map: r => ({ williams_r: r }),
    },
  },
  awesome_oscillator: {
    label: "Awesome Oscillator", requires: "ohlc",
    fields: [{ key: "ao", label: "AO", seriesType: "Histogram" }],
    defaults: { fast_period: 5, slow_period: 34 },
    paramLabels: { fast_period: "Fast", slow_period: "Slow" },
    lib: {
      fn: (i) => AwesomeOscillator.calculate(i),
      input: (d, p) => ({ high: hi(d), low: lo(d), fastPeriod: p.fast_period || 5, slowPeriod: p.slow_period || 34 }),
      map: r => ({ ao: r }),
    },
  },
  psar: {
    label: "Parabolic SAR", requires: "ohlc", overlay: true,
    fields: [{ key: "psar", label: "PSAR" }],
    defaults: { step: 0.02, max: 0.2 },
    paramLabels: { step: "Step", max: "Max" },
    lib: {
      fn: (i) => PSAR.calculate(i),
      input: (d, p) => ({ high: hi(d), low: lo(d), step: p.step || 0.02, max: p.max || 0.2 }),
      map: r => ({ psar: r }),
    },
  },
  keltner: {
    label: "Keltner Channels", requires: "ohlc", overlay: true,
    fields: [
      { key: "upper", label: "Upper" },
      { key: "middle", label: "Middle" },
      { key: "lower", label: "Lower" },
    ],
    defaults: { ma_period: 20, atr_period: 10, multiplier: 1 },
    paramLabels: { ma_period: "MA", atr_period: "ATR", multiplier: "Mult" },
    lib: {
      fn: (i) => KeltnerChannels.calculate(i),
      input: (d, p) => ({
        high: hi(d), low: lo(d), close: cl(d),
        maPeriod: p.ma_period || 20, atrPeriod: p.atr_period || 10, multiplier: p.multiplier || 1, useSMA: false,
      }),
      map: r => ({ upper: r.upper ?? null, middle: r.middle ?? null, lower: r.lower ?? null }),
    },
  },
  chandelier: {
    label: "Chandelier Exit", requires: "ohlc", overlay: true,
    fields: [
      { key: "exit_long", label: "Exit Long" },
      { key: "exit_short", label: "Exit Short" },
    ],
    defaults: { period: 22, multiplier: 3 },
    paramLabels: { period: "Period", multiplier: "Mult" },
    lib: {
      fn: (i) => ChandelierExit.calculate(i),
      input: (d, p) => ({ high: hi(d), low: lo(d), close: cl(d), period: p.period || 22, multiplier: p.multiplier || 3 }),
      map: r => ({ exit_long: r.exitLong ?? null, exit_short: r.exitShort ?? null }),
    },
  },
  ichimoku: {
    label: "Ichimoku", requires: "ohlc", overlay: true,
    fields: [
      { key: "tenkan_sen", label: "Tenkan" },
      { key: "kijun_sen", label: "Kijun" },
      { key: "senkou_span_a", label: "Senkou A" },
      { key: "senkou_span_b", label: "Senkou B" },
    ],
    defaults: { conversion_period: 9, base_period: 26, span_period: 52, displacement: 26 },
    paramLabels: { conversion_period: "Conv", base_period: "Base", span_period: "Span", displacement: "Displ" },
    lib: {
      fn: (i) => IchimokuCloud.calculate(i),
      input: (d, p) => ({
        high: hi(d), low: lo(d),
        conversionPeriod: p.conversion_period || 9,
        basePeriod: p.base_period || 26,
        spanPeriod: p.span_period || 52,
        displacement: p.displacement || 26,
      }),
      map: r => ({ tenkan_sen: r.conversion ?? null, kijun_sen: r.base ?? null, senkou_span_a: r.spanA ?? null, senkou_span_b: r.spanB ?? null }),
    },
  },

  // --- OHLCV indicators (need volume) ---
  mfi: {
    label: "MFI", requires: "ohlcv",
    fields: [{ key: "mfi", label: "MFI" }],
    defaults: { period: 14 },
    paramLabels: { period: "Period" },
    lib: {
      fn: (i) => MFI.calculate(i),
      input: (d, p) => ({ high: hi(d), low: lo(d), close: cl(d), volume: vol(d), period: p.period || 14 }),
      map: r => ({ mfi: r }),
    },
  },
  obv: {
    label: "OBV", requires: "ohlcv",
    fields: [{ key: "obv", label: "OBV" }],
    defaults: {},
    paramLabels: {},
    lib: {
      fn: (i) => OBV.calculate(i),
      input: (d) => ({ close: cl(d), volume: vol(d) }),
      map: r => ({ obv: r }),
    },
  },
  vwap: {
    label: "VWAP", requires: "ohlcv", overlay: true,
    fields: [{ key: "vwap", label: "VWAP" }],
    defaults: {},
    paramLabels: {},
    lib: {
      fn: (i) => VWAP.calculate(i),
      input: (d) => ({ high: hi(d), low: lo(d), close: cl(d), volume: vol(d) }),
      map: r => ({ vwap: r }),
    },
  },
  force_index: {
    label: "Force Index", requires: "ohlcv",
    fields: [{ key: "fi", label: "FI" }],
    defaults: { period: 13 },
    paramLabels: { period: "Period" },
    lib: {
      fn: (i) => ForceIndex.calculate(i),
      input: (d, p) => ({ close: cl(d), volume: vol(d), period: p.period || 13 }),
      map: r => ({ fi: r }),
    },
  },
  adl: {
    label: "ADL", requires: "ohlcv",
    fields: [{ key: "adl", label: "ADL" }],
    defaults: {},
    paramLabels: {},
    lib: {
      fn: (i) => ADL.calculate(i),
      input: (d) => ({ high: hi(d), low: lo(d), close: cl(d), volume: vol(d) }),
      map: r => ({ adl: r }),
    },
  },

  // --- Server-side only (no JS equivalent) ---
  sr: {
    label: "Support/Resistance", requires: "ohlc",
    fields: [
      { key: "sr", label: "SR" },
      { key: "sr_signal", label: "SR Signal" },
    ],
    defaults: { period: 14 },
    paramLabels: { period: "Period" },
  },
}
