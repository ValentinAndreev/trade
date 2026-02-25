import { LineSeries, HistogramSeries } from "lightweight-charts"
import DataLoader from "./data_loader"
import BitfinexFeed from "./bitfinex_feed"
import CableFeed from "./cable_feed"
import IndicatorLoader from "./indicator_loader"
import { OVERLAY_COLORS } from "./theme"
import { INDICATOR_META } from "./indicators"
import {
  normalizeColorScheme, normalizeOpacity, indicatorFieldColors,
} from "./series_factory"

export default class IndicatorManager {
  constructor(chart, overlayMap, timeframe, { onScaleSync, onCandle }) {
    this.chart = chart
    this.overlayMap = overlayMap
    this.timeframe = timeframe
    this._onScaleSync = onScaleSync
    this._onCandle = onCandle
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
    const meta = INDICATOR_META[indicatorType]

    const url = `/api/candles?symbol=${encodeURIComponent(config.symbol)}&timeframe=${encodeURIComponent(this.timeframe)}&limit=1500`
    const loader = new DataLoader(url)
    const onCandle = (candle) => this._onCandle(config.id, candle)
    const bfxFeed = new BitfinexFeed(config.symbol, this.timeframe, onCandle)
    const cableFeed = new CableFeed(config.symbol, this.timeframe, onCandle)

    const ov = {
      series: null, loader, bfxFeed, cableFeed,
      mode: "indicator", chartType: "Line",
      colorIndex: ci, colorScheme: ci, opacity, colors, visible,
      basePriceScaleId, activePriceScaleId: basePriceScaleId,
      symbol: config.symbol,
      indicatorType, indicatorParams, pinnedTo,
      indicatorSeries: [],
    }

    this.overlayMap.set(config.id, ov)

    if (meta) {
      this.loadData(config.id, ov)
    }
    this._onScaleSync()
    return ci
  }

  async loadData(id, ov) {
    const meta = INDICATOR_META[ov.indicatorType]
    if (!meta) return

    const sourceSymbol = this.resolveSymbol(ov)
    const scaleId = this.resolveScaleId(ov)

    const indLoader = new IndicatorLoader(sourceSymbol, this.timeframe, ov.indicatorType, ov.indicatorParams)
    try {
      const data = await indLoader.load()

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

      this.chart.timeScale().fitContent()
      // Reset so _syncSelectedOverlayScale sees a stale value and applies the correct scale
      ov.activePriceScaleId = ov.basePriceScaleId
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
    const oldPinnedTo = ov.pinnedTo
    ov.pinnedTo = pinnedTo || null

    // Source symbol changed — reload indicator data
    const oldSymbol = oldPinnedTo ? (this.overlayMap.get(oldPinnedTo)?.symbol || ov.symbol) : ov.symbol
    const newSymbol = this.resolveSymbol(ov)
    if (oldSymbol !== newSymbol && ov.indicatorSeries) {
      this.removeSeriesFor(ov)
      this.loadData(id, ov)
      return
    }

    // Same symbol — just re-apply scale
    const scaleId = this.resolveScaleId(ov)
    if (ov.indicatorSeries) {
      ov.indicatorSeries.forEach(s => s.series.applyOptions({ priceScaleId: scaleId }))
    }
    this._onScaleSync()
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
}
