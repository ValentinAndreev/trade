import { Controller } from "@hotwired/stimulus"
import { createChart } from "lightweight-charts"

import {
  CHART_THEME, PRICE_SERIES_TYPES, VOLUME_SERIES_TYPES, OVERLAY_COLORS,
} from "../chart/theme"
import { toVolumePoint, toVolumeData } from "../chart/volume"
import DataLoader from "../chart/data_loader"
import BitfinexFeed from "../chart/bitfinex_feed"
import CableFeed from "../chart/cable_feed"
import Scrollbar from "../chart/scrollbar"

export default class extends Controller {
  static values = {
    timeframe: { type: String, default: "1m" },
    overlays: { type: String, default: "[]" },
  }

  connect() {
    this.overlayMap = new Map() // id -> { series, loader, bfxFeed, cableFeed, mode, chartType, colorIndex }
    this._colorIndex = 0

    const configs = this._parseOverlays()
    if (configs.length === 0 || configs.every(c => !c.symbol)) return

    this._initChart()

    configs.forEach(config => {
      if (config.symbol) this._addOverlayInternal(config)
    })

    this._startFeeds()
  }

  disconnect() {
    for (const [, ov] of this.overlayMap) {
      ov.bfxFeed?.disconnect()
      ov.cableFeed?.disconnect()
    }
    if (this.scrollHandler) {
      this.chart?.timeScale().unsubscribeVisibleLogicalRangeChange(this.scrollHandler)
    }
    this.scrollbar?.destroy()
    this.chart?.remove()
    this.chartWrapperEl?.remove()
    this.overlayMap.clear()
  }

  // --- Public API for tabs_controller ---

  addOverlay(config) {
    if (!this.chart) {
      this._initChart()
    }
    this._addOverlayInternal(config)
    const ov = this.overlayMap.get(config.id)
    if (ov) {
      this._loadOverlayData(ov, config.id).then(() => {
        ov.bfxFeed.connect()
      })
      ov.cableFeed.connect()
    }
  }

  removeOverlay(id) {
    const ov = this.overlayMap.get(id)
    if (!ov) return
    ov.bfxFeed?.disconnect()
    ov.cableFeed?.disconnect()
    this.chart.removeSeries(ov.series)
    this.overlayMap.delete(id)
  }

  showMode(id, mode) {
    const ov = this.overlayMap.get(id)
    if (!ov || ov.mode === mode) return
    ov.mode = mode
    this._recreateSeries(id)
  }

  switchChartType(id, chartType) {
    const ov = this.overlayMap.get(id)
    if (!ov || ov.chartType === chartType) return
    ov.chartType = chartType
    this._recreateSeries(id)
  }

  // --- Internal ---

  _parseOverlays() {
    try {
      return JSON.parse(this.overlaysValue)
    } catch {
      return []
    }
  }

  _initChart() {
    Object.assign(this.element.style, {
      display: "flex",
      flexDirection: "column",
      overflow: "hidden",
    })

    this.chartWrapperEl = document.createElement("div")
    Object.assign(this.chartWrapperEl.style, { flex: "1", minHeight: "0" })
    this.element.appendChild(this.chartWrapperEl)

    this.chart = createChart(this.chartWrapperEl, {
      ...CHART_THEME,
      autoSize: true,
      timeScale: { timeVisible: true, secondsVisible: false },
    })

    this.scrollbar = new Scrollbar(this.element, {
      getVisibleRange: () => this.chart.timeScale().getVisibleLogicalRange(),
      setVisibleRange: (range) => this.chart.timeScale().setVisibleLogicalRange(range),
      getTotalBars: () => this._maxBarsCount(),
    })
  }

  _addOverlayInternal(config) {
    const colorIndex = this._colorIndex++
    const colors = OVERLAY_COLORS[colorIndex % OVERLAY_COLORS.length]
    const mode = config.mode || "price"
    const chartType = config.chartType || (mode === "volume" ? "Histogram" : "Candlestick")
    const priceScaleId = this.overlayMap.size === 0 ? "right" : `overlay-${config.id}`

    const series = this._createSeries(mode, chartType, colors, priceScaleId)

    const url = `/api/candles?symbol=${encodeURIComponent(config.symbol)}&timeframe=${encodeURIComponent(this.timeframeValue)}&limit=1500`
    const loader = new DataLoader(url)

    const onCandle = (candle) => this._handleCandle(config.id, candle)
    const bfxFeed = new BitfinexFeed(config.symbol, this.timeframeValue, onCandle)
    const cableFeed = new CableFeed(config.symbol, this.timeframeValue, onCandle)

    this.overlayMap.set(config.id, {
      series, loader, bfxFeed, cableFeed,
      mode, chartType, colorIndex, colors, priceScaleId,
      symbol: config.symbol,
    })
  }

  _createSeries(mode, chartType, colors, priceScaleId) {
    if (mode === "volume") {
      const def = VOLUME_SERIES_TYPES[chartType] || VOLUME_SERIES_TYPES.Histogram
      return this.chart.addSeries(def.type, {
        ...def.options,
        priceScaleId,
        ...(chartType === "Histogram" ? {} : { color: colors.line }),
      })
    }

    const def = PRICE_SERIES_TYPES[chartType] || PRICE_SERIES_TYPES.Candlestick
    const colorOverrides = this._priceColorOverrides(chartType, colors)
    return this.chart.addSeries(def.type, {
      ...def.options,
      ...colorOverrides,
      priceScaleId,
    })
  }

  _priceColorOverrides(chartType, colors) {
    switch (chartType) {
      case "Candlestick":
        return {
          upColor: colors.up, downColor: colors.down,
          wickUpColor: colors.up, wickDownColor: colors.down,
        }
      case "Bar":
        return { upColor: colors.up, downColor: colors.down }
      case "Line":
        return { color: colors.line }
      case "Area":
        return {
          lineColor: colors.line,
          topColor: colors.line + "66",
          bottomColor: colors.line + "0d",
        }
      case "Baseline":
        return {
          topLineColor: colors.up, bottomLineColor: colors.down,
          topFillColor1: colors.up + "33", topFillColor2: colors.up + "05",
          bottomFillColor1: colors.down + "05", bottomFillColor2: colors.down + "33",
        }
      default:
        return {}
    }
  }

  _recreateSeries(id) {
    const ov = this.overlayMap.get(id)
    if (!ov) return
    this.chart.removeSeries(ov.series)
    ov.series = this._createSeries(ov.mode, ov.chartType, ov.colors, ov.priceScaleId)
    if (ov.loader.candles.length > 0) {
      ov.series.setData(this._toSeriesData(ov, ov.loader.candles))
    }
  }

  // --- Data formatting ---

  _toSeriesData(ov, candles) {
    if (ov.mode === "volume") {
      if (ov.chartType === "Histogram") return toVolumeData(candles)
      return candles.map(c => ({ time: c.time, value: c.volume || 0 }))
    }
    if (ov.chartType === "Candlestick" || ov.chartType === "Bar") return candles
    return candles.map(c => ({ time: c.time, value: c.close }))
  }

  _toUpdatePoint(ov, candle) {
    if (ov.mode === "volume") {
      if (ov.chartType === "Histogram") return toVolumePoint(candle)
      return { time: candle.time, value: candle.volume || 0 }
    }
    if (ov.chartType === "Candlestick" || ov.chartType === "Bar") return candle
    return { time: candle.time, value: candle.close }
  }

  // --- Realtime ---

  _handleCandle(overlayId, candle) {
    const ov = this.overlayMap.get(overlayId)
    if (!ov) return
    ov.loader.updateCandle(candle)
    try {
      ov.series.update(this._toUpdatePoint(ov, candle))
    } catch (e) {
      console.log("[chart] update skipped:", e.message)
    }
  }

  // --- Data loading ---

  _startFeeds() {
    const loadPromises = []
    for (const [id, ov] of this.overlayMap) {
      loadPromises.push(this._loadOverlayData(ov, id))
    }

    Promise.all(loadPromises).then(() => {
      this.chart.timeScale().fitContent()
      requestAnimationFrame(() => this.scrollbar?.update())
      this._subscribeToScroll()
      for (const [, ov] of this.overlayMap) {
        ov.bfxFeed.connect()
      }
    })

    for (const [, ov] of this.overlayMap) {
      ov.cableFeed.connect()
    }
  }

  async _loadOverlayData(ov, id) {
    try {
      const candles = await ov.loader.loadInitial()
      ov.series.setData(this._toSeriesData(ov, candles))
    } catch (error) {
      console.error(`Failed to load data for overlay ${id}:`, error)
    }
  }

  _subscribeToScroll() {
    this.scrollHandler = (range) => {
      if (!range) return
      this.scrollbar?.update()
      if (range.from < 50) this._loadMoreHistory()
    }
    this.chart.timeScale().subscribeVisibleLogicalRangeChange(this.scrollHandler)

    const range = this.chart.timeScale().getVisibleLogicalRange()
    if (range && range.from < 50) this._loadMoreHistory()
  }

  async _loadMoreHistory() {
    const scrollPos = this.chart.timeScale().scrollPosition()
    let maxAdded = 0

    for (const [, ov] of this.overlayMap) {
      const filtered = await ov.loader.loadMoreHistory()
      if (!filtered) continue
      ov.series.setData(this._toSeriesData(ov, ov.loader.candles))
      if (filtered.length > maxAdded) maxAdded = filtered.length
    }

    if (maxAdded > 0) {
      this.chart.timeScale().scrollToPosition(scrollPos + maxAdded, false)
    }
  }

  _maxBarsCount() {
    let max = 0
    for (const [, ov] of this.overlayMap) {
      if (ov.loader.candles.length > max) max = ov.loader.candles.length
    }
    return max
  }
}
