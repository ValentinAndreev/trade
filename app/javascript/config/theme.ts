import {
  CandlestickSeries, BarSeries, LineSeries, AreaSeries,
  BaselineSeries, HistogramSeries,
} from "lightweight-charts"
import type { DeepPartial, ChartOptions, SeriesDefinition, SeriesType } from "lightweight-charts"
import type { ColorScheme } from "../types/store"

// UI background and border palette
export const BG_PRIMARY    = "#1a1a2e"
export const BG_SECONDARY  = "#22223a"
export const BG_HOVER      = "#2a2a3e"
export const BORDER_COLOR  = "#3a3a4e"
export const ACCENT_COLOR  = "#3b82f6"

export const CHART_THEME: DeepPartial<ChartOptions> = {
  layout: { background: { color: BG_PRIMARY }, textColor: "#e0e0e0" },
  grid: { vertLines: { color: BG_HOVER }, horzLines: { color: BG_HOVER } },
  crosshair: { mode: 0 },
}

export const UP_COLOR = "#26a69a"
export const DOWN_COLOR = "#ef5350"
/** Alias for UP_COLOR — used for long trade markers */
export const LONG_COLOR = UP_COLOR
/** Alias for DOWN_COLOR — used for short trade markers */
export const SHORT_COLOR = DOWN_COLOR
export const VOLUME_UP_COLOR = "rgba(38,166,154,0.5)"
export const VOLUME_DOWN_COLOR = "rgba(239,83,80,0.5)"

type SeriesConfig = { type: SeriesDefinition<SeriesType>; options: Record<string, unknown> }

export const PRICE_SERIES_TYPES: Record<string, SeriesConfig> = {
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

export const VOLUME_SERIES_TYPES: Record<string, SeriesConfig> = {
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

// Distinct colors for multiple overlays on one chart
export const OVERLAY_COLORS: ColorScheme[] = [
  { up: "#26a69a", down: "#ef5350", line: "#26a69a" },  // teal/red (default)
  { up: "#42a5f5", down: "#42a5f5", line: "#42a5f5" },  // all blue
  { up: "#ef5350", down: "#ef5350", line: "#ef5350" },  // all red
  { up: "#42a5f5", down: "#ff7043", line: "#42a5f5" },  // blue/orange
  { up: "#ab47bc", down: "#ffa726", line: "#ab47bc" },  // purple/amber
  { up: "#66bb6a", down: "#ec407a", line: "#66bb6a" },  // green/pink
  { up: "#29b6f6", down: "#f44336", line: "#29b6f6" },  // light blue/red
  { up: "#fdd835", down: "#8e24aa", line: "#fdd835" },  // yellow/purple
  { up: "#ff8a65", down: "#5c6bc0", line: "#ff8a65" },  // deep orange/indigo
  { up: "#26c6da", down: "#d4e157", line: "#26c6da" },  // cyan/lime
]
