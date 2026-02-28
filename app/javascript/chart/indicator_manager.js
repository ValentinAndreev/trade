import { LineSeries, HistogramSeries } from "lightweight-charts"
import IndicatorLoader from "./indicator_loader"
import { OVERLAY_COLORS } from "./theme"
import { INDICATOR_META } from "./indicators"
import { indicatorFieldColors } from "./series_factory"
import { normalizeColorScheme, normalizeOpacity } from "../utils/color"

export default class IndicatorManager {
  constructor(chart, overlayMap, timeframe, { onScaleSync }) {
    this.chart = chart
    this.overlayMap = overlayMap
    this.timeframe = timeframe
    this._onScaleSync = onScaleSync
    this._recomputeTimers = new Map()
  }

  addOverlay(config, colorIndex) {
    const ci = normalizeColorScheme(config.colorScheme, colorIndex)
    const colors = OVERLAY_COLORS[ci]
    const visible = config.visible !== false
    const opacity = normalizeOpacity(config.opacity, 1)
    const basePriceScaleId = `overlay-${config.id}`
    const indicatorType = config.indicatorType || "sma"
    const indicatorParams = config.indicatorParams || {}
    const pinnedTo = config.pinnedTo || null

    const ov = {
      series: null,
      mode: "indicator", chartType: "Line",
      colorIndex: ci, colorScheme: ci, opacity, colors, visible,
      basePriceScaleId, activePriceScaleId: basePriceScaleId,
      symbol: config.symbol,
      indicatorType, indicatorParams, pinnedTo,
      indicatorSeries: [],
    }

    this.overlayMap.set(config.id, ov)

    if (INDICATOR_META[indicatorType]) {
      this.loadData(config.id, ov)
    }
    this._onScaleSync()
    return ci
  }

  async loadData(id, ov) {
    const meta = INDICATOR_META[ov.indicatorType]
    if (!meta) return

    // overlay indicators share source's scale, oscillators get their own
    const scaleId = meta.overlay ? this.resolveScaleId(ov) : ov.basePriceScaleId

    try {
      const sourceData = this._resolveSourceData(ov)
      const data = await this._compute(ov, sourceData)
      if (!data || data.length === 0) return

      const fieldColors = indicatorFieldColors(ov.colors, meta.fields.length, ov.opacity)
      ov.indicatorSeries = meta.fields.map((field, i) => {
        const seriesType = field.seriesType === "Histogram" ? HistogramSeries : LineSeries
        const color = fieldColors[i]
        const options = field.seriesType === "Histogram"
          ? { color, priceScaleId: scaleId, visible: ov.visible }
          : { color, lineWidth: 2, priceScaleId: scaleId, visible: ov.visible }
        const series = this.chart.addSeries(seriesType, options)
        const seriesData = data
          .filter(d => d[field.key] != null)
          .map(d => ({ time: d.time, value: d[field.key] }))
        series.setData(seriesData)
        return { series, fieldKey: field.key }
      })

      ov.activePriceScaleId = scaleId
      this._onScaleSync()
    } catch (error) {
      console.error(`Failed to load indicator ${ov.indicatorType} for overlay ${id}:`, error)
    }
  }

  updateIndicator(id, type, params, pinnedTo) {
    const ov = this.overlayMap.get(id)
    if (!ov) return

    this.removeSeriesFor(ov)
    ov.indicatorType = type
    ov.indicatorParams = params
    ov.mode = "indicator"
    if (pinnedTo !== undefined) ov.pinnedTo = pinnedTo || null

    this.loadData(id, ov)
  }

  setPinnedTo(id, pinnedTo) {
    const ov = this.overlayMap.get(id)
    if (!ov) return
    ov.pinnedTo = pinnedTo || null

    this.removeSeriesFor(ov)
    this.loadData(id, ov)
  }

  refreshAll(sourceId) {
    for (const [id, ov] of this.overlayMap) {
      if (ov.mode !== "indicator") continue
      if (sourceId && ov.pinnedTo !== sourceId) continue
      if (ov.indicatorSeries?.length) {
        this._scheduleRecompute(id, ov)
      } else if (INDICATOR_META[ov.indicatorType]) {
        this.loadData(id, ov)
      }
    }
  }

  resolveSymbol(ov) {
    if (!ov.pinnedTo) return ov.symbol
    const target = this.overlayMap.get(ov.pinnedTo)
    return target ? target.symbol : ov.symbol
  }

  resolveScaleId(ov) {
    if (!ov.pinnedTo) return ov.basePriceScaleId
    const target = this.overlayMap.get(ov.pinnedTo)
    if (!target) return ov.basePriceScaleId
    return target.activePriceScaleId || target.basePriceScaleId
  }

  removeSeriesFor(ov) {
    if (ov.indicatorSeries) {
      ov.indicatorSeries.forEach(s => { try { this.chart.removeSeries(s.series) } catch {} })
      ov.indicatorSeries = []
    }
  }

  // --- Private ---

  _scheduleRecompute(id, ov) {
    if (this._recomputeTimers.has(id)) return
    this._recomputeTimers.set(id, setTimeout(() => {
      this._recomputeTimers.delete(id)
      this._recompute(ov)
    }, 500))
  }

  async _recompute(ov) {
    try {
      const sourceData = this._resolveSourceData(ov)
      const data = await this._compute(ov, sourceData)
      if (!data) return

      ov.indicatorSeries.forEach(({ series, fieldKey }) => {
        const seriesData = data
          .filter(d => d[fieldKey] != null)
          .map(d => ({ time: d.time, value: d[fieldKey] }))
        series.setData(seriesData)
      })
    } catch (error) {
      console.error(`[indicator] recompute failed:`, error)
    }
  }

  async _compute(ov, sourceData) {
    if (!sourceData || sourceData.length === 0) return []

    const meta = INDICATOR_META[ov.indicatorType]
    if (meta?.lib) {
      const result = meta.lib.fn(meta.lib.input(sourceData, ov.indicatorParams || {}))
      const offset = sourceData.length - result.length
      return result.map((val, i) => ({ time: sourceData[i + offset].time, ...meta.lib.map(val) }))
    }

    // Server-side: skip if source data hasn't changed
    const sourceKey = `${sourceData.length}:${sourceData[0].time}`
    if (ov._lastSourceKey === sourceKey) return null
    ov._lastSourceKey = sourceKey

    const symbol = this.resolveSymbol(ov)
    const startTime = sourceData[0].time
    const indLoader = new IndicatorLoader(ov.indicatorType, ov.indicatorParams)
    return indLoader.compute(symbol, this.timeframe, startTime)
  }

  _resolveSourceData(ov) {
    const target = ov.pinnedTo ? this.overlayMap.get(ov.pinnedTo) : null

    const candles = target?.loader?.candles
    if (!candles || candles.length === 0) return []

    const field = target?.mode === "volume" ? "volume" : "close"
    return candles.map(c => ({
      time: c.time, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume,
      value: c[field],
    }))
  }
}
