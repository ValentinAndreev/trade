import {
  PRICE_SERIES_TYPES, VOLUME_SERIES_TYPES, OVERLAY_COLORS,
} from "./theme"

export function createOverlaySeries(chart, mode, chartType, colors, priceScaleId, visible = true, opacity = 1) {
  const styleOverrides = seriesStyleOverrides(mode, chartType, colors, opacity)

  if (mode === "volume") {
    const def = VOLUME_SERIES_TYPES[chartType] || VOLUME_SERIES_TYPES.Histogram
    return chart.addSeries(def.type, {
      ...def.options,
      ...styleOverrides,
      priceScaleId,
      visible,
    })
  }

  const def = PRICE_SERIES_TYPES[chartType] || PRICE_SERIES_TYPES.Candlestick
  return chart.addSeries(def.type, {
    ...def.options,
    ...styleOverrides,
    priceScaleId,
    visible,
  })
}

export function seriesStyleOverrides(mode, chartType, colors, opacity) {
  if (mode === "volume") {
    if (chartType === "Histogram") return {}
    if (chartType === "Area") {
      return {
        lineColor: withAlpha(colors.line, opacity),
        topColor: withAlpha(colors.line, opacity * 0.3),
        bottomColor: withAlpha(colors.line, opacity * 0.02),
      }
    }
    return { color: withAlpha(colors.line, opacity) }
  }
  return priceColorOverrides(chartType, colors, opacity)
}

export function priceColorOverrides(chartType, colors, opacity) {
  switch (chartType) {
    case "Candlestick":
      return {
        upColor: withAlpha(colors.up, opacity),
        downColor: withAlpha(colors.down, opacity),
        wickUpColor: withAlpha(colors.up, opacity),
        wickDownColor: withAlpha(colors.down, opacity),
      }
    case "Bar":
      return {
        upColor: withAlpha(colors.up, opacity),
        downColor: withAlpha(colors.down, opacity),
      }
    case "Line":
      return { color: withAlpha(colors.line, opacity) }
    case "Area":
      return {
        lineColor: withAlpha(colors.line, opacity),
        topColor: withAlpha(colors.line, opacity * 0.4),
        bottomColor: withAlpha(colors.line, opacity * 0.05),
      }
    case "Baseline":
      return {
        topLineColor: withAlpha(colors.up, opacity),
        bottomLineColor: withAlpha(colors.down, opacity),
        topFillColor1: withAlpha(colors.up, opacity * 0.2),
        topFillColor2: withAlpha(colors.up, opacity * 0.02),
        bottomFillColor1: withAlpha(colors.down, opacity * 0.02),
        bottomFillColor2: withAlpha(colors.down, opacity * 0.2),
      }
    default:
      return {}
  }
}

export function withAlpha(color, alpha = 1) {
  const a = Math.max(0, Math.min(1, alpha))

  if (typeof color === "string" && color.startsWith("#")) {
    let hex = color.slice(1)
    if (hex.length === 3) {
      hex = hex.split("").map(ch => ch + ch).join("")
    }
    if (hex.length === 6) {
      const r = parseInt(hex.slice(0, 2), 16)
      const g = parseInt(hex.slice(2, 4), 16)
      const b = parseInt(hex.slice(4, 6), 16)
      return `rgba(${r},${g},${b},${a})`
    }
  }

  const rgbaMatch = typeof color === "string" && color.match(/^rgba?\(([^)]+)\)$/)
  if (rgbaMatch) {
    const parts = rgbaMatch[1].split(",").map(part => part.trim())
    if (parts.length >= 3) {
      return `rgba(${parts[0]},${parts[1]},${parts[2]},${a})`
    }
  }

  return color
}

export function normalizeColorScheme(colorScheme, fallback = 0) {
  const value = parseInt(colorScheme, 10)
  if (Number.isNaN(value) || value < 0) return ((fallback % OVERLAY_COLORS.length) + OVERLAY_COLORS.length) % OVERLAY_COLORS.length
  return value % OVERLAY_COLORS.length
}

export function normalizeOpacity(opacity, fallback = 1) {
  const value = parseFloat(opacity)
  if (Number.isNaN(value)) return fallback
  if (value < 0) return 0
  if (value > 1) return 1
  return value
}

export function toSeriesData(ov, candles) {
  if (ov.mode === "volume") {
    if (ov.chartType === "Histogram") {
      return candles.map(c => ({
        time: c.time,
        value: c.volume || 0,
        color: withAlpha(c.close >= c.open ? ov.colors.up : ov.colors.down, ov.opacity * 0.5),
      }))
    }
    return candles.map(c => ({ time: c.time, value: c.volume || 0 }))
  }
  if (ov.chartType === "Candlestick" || ov.chartType === "Bar") return candles
  return candles.map(c => ({ time: c.time, value: c.close }))
}

export function toUpdatePoint(ov, candle) {
  if (ov.mode === "volume") {
    if (ov.chartType === "Histogram") {
      return {
        time: candle.time,
        value: candle.volume || 0,
        color: withAlpha(candle.close >= candle.open ? ov.colors.up : ov.colors.down, ov.opacity * 0.5),
      }
    }
    return { time: candle.time, value: candle.volume || 0 }
  }
  if (ov.chartType === "Candlestick" || ov.chartType === "Bar") return candle
  return { time: candle.time, value: candle.close }
}

export function indicatorFieldColors(colors, count, opacity) {
  if (count === 1) return [withAlpha(colors.line, opacity)]
  const palette = [colors.line, colors.up, colors.down, "#ffa726", "#ab47bc"]
  return Array.from({ length: count }, (_, i) =>
    withAlpha(palette[i % palette.length], opacity)
  )
}
