import {
  CandlestickSeries, BarSeries, LineSeries, AreaSeries,
  BaselineSeries, HistogramSeries,
} from "lightweight-charts"

export const CHART_THEME = {
  layout: { background: { color: "#1a1a2e" }, textColor: "#e0e0e0" },
  grid: { vertLines: { color: "#2a2a3e" }, horzLines: { color: "#2a2a3e" } },
  crosshair: { mode: 0 },
}

export const UP_COLOR = "#26a69a"
export const DOWN_COLOR = "#ef5350"
export const VOLUME_UP_COLOR = "rgba(38,166,154,0.5)"
export const VOLUME_DOWN_COLOR = "rgba(239,83,80,0.5)"

export const PRICE_SERIES_TYPES = {
  Candlestick: {
    type: CandlestickSeries,
    options: { upColor: UP_COLOR, downColor: DOWN_COLOR, borderVisible: false, wickUpColor: UP_COLOR, wickDownColor: DOWN_COLOR },
  },
  Bar: {
    type: BarSeries,
    options: { upColor: UP_COLOR, downColor: DOWN_COLOR },
  },
  Line: {
    type: LineSeries,
    options: { color: UP_COLOR, lineWidth: 2 },
  },
  Area: {
    type: AreaSeries,
    options: { lineColor: UP_COLOR, topColor: "rgba(38,166,154,0.4)", bottomColor: "rgba(38,166,154,0.05)", lineWidth: 2 },
  },
  Baseline: {
    type: BaselineSeries,
    options: { topLineColor: UP_COLOR, bottomLineColor: DOWN_COLOR, topFillColor1: "rgba(38,166,154,0.2)", topFillColor2: "rgba(38,166,154,0.02)", bottomFillColor1: "rgba(239,83,80,0.02)", bottomFillColor2: "rgba(239,83,80,0.2)" },
  },
}

export const VOLUME_SERIES_TYPES = {
  Histogram: {
    type: HistogramSeries,
    options: { priceFormat: { type: "volume" } },
  },
  Line: {
    type: LineSeries,
    options: { color: UP_COLOR, lineWidth: 1, priceFormat: { type: "volume" } },
  },
  Area: {
    type: AreaSeries,
    options: { lineColor: UP_COLOR, topColor: "rgba(38,166,154,0.3)", bottomColor: "rgba(38,166,154,0.02)", lineWidth: 1, priceFormat: { type: "volume" } },
  },
}

// For backwards compat
export const CANDLE_STYLE = PRICE_SERIES_TYPES.Candlestick.options
