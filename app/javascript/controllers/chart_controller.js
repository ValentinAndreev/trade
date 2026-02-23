import { Controller } from "@hotwired/stimulus"
import { createChart } from "lightweight-charts"

import {
  CHART_THEME, PRICE_SERIES_TYPES, VOLUME_SERIES_TYPES, OVERLAY_COLORS,
} from "../chart/theme"
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
    this.overlayMap = new Map() // id -> { series, loader, bfxFeed, cableFeed, mode, chartType, visible, colorScheme, opacity, colors, basePriceScaleId, activePriceScaleId }
    this._colorIndex = 0
    this.selectedOverlayId = null

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
    this._syncSelectedOverlayScale()
  }

  removeOverlay(id) {
    const ov = this.overlayMap.get(id)
    if (!ov) return
    ov.bfxFeed?.disconnect()
    ov.cableFeed?.disconnect()
    this.chart.removeSeries(ov.series)
    this.overlayMap.delete(id)
    if (this.selectedOverlayId === id) this.selectedOverlayId = null
    this._syncSelectedOverlayScale()
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

  setSelectedOverlayScale(id) {
    this.selectedOverlayId = id && this.overlayMap.has(id) ? id : null
    this._syncSelectedOverlayScale()
  }

  setOverlayVisibility(id, visible) {
    const ov = this.overlayMap.get(id)
    if (!ov) return
    const normalized = visible !== false
    if (ov.visible === normalized) return
    ov.visible = normalized
    ov.series.applyOptions({ visible: normalized })
    this._syncSelectedOverlayScale()
  }

  setOverlayColorScheme(id, colorScheme) {
    const ov = this.overlayMap.get(id)
    if (!ov) return
    const normalized = this._normalizeColorScheme(colorScheme, ov.colorScheme)
    if (ov.colorScheme === normalized) return
    ov.colorScheme = normalized
    ov.colorIndex = normalized
    ov.colors = OVERLAY_COLORS[normalized]
    this._applyOverlayStyle(ov)
  }

  setOverlayOpacity(id, opacity) {
    const ov = this.overlayMap.get(id)
    if (!ov) return
    const normalized = this._normalizeOpacity(opacity, ov.opacity)
    if (ov.opacity === normalized) return
    ov.opacity = normalized
    this._applyOverlayStyle(ov)
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
      leftPriceScale: { visible: false },
      rightPriceScale: { visible: true },
    })

    this.scrollbar = new Scrollbar(this.element, {
      getVisibleRange: () => this.chart.timeScale().getVisibleLogicalRange(),
      setVisibleRange: (range) => this.chart.timeScale().setVisibleLogicalRange(range),
      getTotalBars: () => this._maxBarsCount(),
    })
  }

  _addOverlayInternal(config) {
    const colorIndex = this._normalizeColorScheme(config.colorScheme, this._colorIndex++)
    const colors = OVERLAY_COLORS[colorIndex]
    const mode = config.mode || "price"
    const chartType = config.chartType || (mode === "volume" ? "Histogram" : "Candlestick")
    const visible = config.visible !== false
    const opacity = this._normalizeOpacity(config.opacity, 1)
    const basePriceScaleId = `overlay-${config.id}`

    const series = this._createSeries(mode, chartType, colors, basePriceScaleId, visible, opacity)

    const url = `/api/candles?symbol=${encodeURIComponent(config.symbol)}&timeframe=${encodeURIComponent(this.timeframeValue)}&limit=1500`
    const loader = new DataLoader(url)

    const onCandle = (candle) => this._handleCandle(config.id, candle)
    const bfxFeed = new BitfinexFeed(config.symbol, this.timeframeValue, onCandle)
    const cableFeed = new CableFeed(config.symbol, this.timeframeValue, onCandle)

    this.overlayMap.set(config.id, {
      series, loader, bfxFeed, cableFeed,
      mode, chartType, colorIndex, colorScheme: colorIndex, opacity, colors, visible,
      basePriceScaleId, activePriceScaleId: basePriceScaleId,
      symbol: config.symbol,
    })
    this._syncSelectedOverlayScale()
  }

  _createSeries(mode, chartType, colors, priceScaleId, visible = true, opacity = 1) {
    const styleOverrides = this._seriesStyleOverrides(mode, chartType, colors, opacity)

    if (mode === "volume") {
      const def = VOLUME_SERIES_TYPES[chartType] || VOLUME_SERIES_TYPES.Histogram
      return this.chart.addSeries(def.type, {
        ...def.options,
        ...styleOverrides,
        priceScaleId,
        visible,
      })
    }

    const def = PRICE_SERIES_TYPES[chartType] || PRICE_SERIES_TYPES.Candlestick
    return this.chart.addSeries(def.type, {
      ...def.options,
      ...styleOverrides,
      priceScaleId,
      visible,
    })
  }

  _seriesStyleOverrides(mode, chartType, colors, opacity) {
    if (mode === "volume") {
      if (chartType === "Histogram") return {}
      if (chartType === "Area") {
        return {
          lineColor: this._withAlpha(colors.line, opacity),
          topColor: this._withAlpha(colors.line, opacity * 0.3),
          bottomColor: this._withAlpha(colors.line, opacity * 0.02),
        }
      }
      return { color: this._withAlpha(colors.line, opacity) }
    }
    return this._priceColorOverrides(chartType, colors, opacity)
  }

  _priceColorOverrides(chartType, colors, opacity) {
    switch (chartType) {
      case "Candlestick":
        return {
          upColor: this._withAlpha(colors.up, opacity),
          downColor: this._withAlpha(colors.down, opacity),
          wickUpColor: this._withAlpha(colors.up, opacity),
          wickDownColor: this._withAlpha(colors.down, opacity),
        }
      case "Bar":
        return {
          upColor: this._withAlpha(colors.up, opacity),
          downColor: this._withAlpha(colors.down, opacity),
        }
      case "Line":
        return { color: this._withAlpha(colors.line, opacity) }
      case "Area":
        return {
          lineColor: this._withAlpha(colors.line, opacity),
          topColor: this._withAlpha(colors.line, opacity * 0.4),
          bottomColor: this._withAlpha(colors.line, opacity * 0.05),
        }
      case "Baseline":
        return {
          topLineColor: this._withAlpha(colors.up, opacity),
          bottomLineColor: this._withAlpha(colors.down, opacity),
          topFillColor1: this._withAlpha(colors.up, opacity * 0.2),
          topFillColor2: this._withAlpha(colors.up, opacity * 0.02),
          bottomFillColor1: this._withAlpha(colors.down, opacity * 0.02),
          bottomFillColor2: this._withAlpha(colors.down, opacity * 0.2),
        }
      default:
        return {}
    }
  }

  _applyOverlayStyle(ov) {
    if (!ov) return
    const styleOverrides = this._seriesStyleOverrides(ov.mode, ov.chartType, ov.colors, ov.opacity)
    if (Object.keys(styleOverrides).length > 0) {
      ov.series.applyOptions(styleOverrides)
    }
    if (ov.mode === "volume" && ov.chartType === "Histogram" && ov.loader.candles.length > 0) {
      ov.series.setData(this._toSeriesData(ov, ov.loader.candles))
    }
  }

  _recreateSeries(id) {
    const ov = this.overlayMap.get(id)
    if (!ov) return
    this.chart.removeSeries(ov.series)
    ov.series = this._createSeries(ov.mode, ov.chartType, ov.colors, ov.activePriceScaleId, ov.visible, ov.opacity)
    if (ov.loader.candles.length > 0) {
      ov.series.setData(this._toSeriesData(ov, ov.loader.candles))
    }
    this._syncSelectedOverlayScale()
  }

  _normalizeColorScheme(colorScheme, fallback = 0) {
    const value = parseInt(colorScheme, 10)
    if (Number.isNaN(value) || value < 0) return ((fallback % OVERLAY_COLORS.length) + OVERLAY_COLORS.length) % OVERLAY_COLORS.length
    return value % OVERLAY_COLORS.length
  }

  _normalizeOpacity(opacity, fallback = 1) {
    const value = parseFloat(opacity)
    if (Number.isNaN(value)) return fallback
    if (value < 0) return 0
    if (value > 1) return 1
    return value
  }

  _withAlpha(color, alpha = 1) {
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

  _syncSelectedOverlayScale() {
    if (!this.chart) return

    const visibleOverlayIds = []
    for (const [id, ov] of this.overlayMap) {
      if (ov.visible) visibleOverlayIds.push(id)
    }

    const selectedVisible = this.selectedOverlayId &&
      this.overlayMap.has(this.selectedOverlayId) &&
      this.overlayMap.get(this.selectedOverlayId).visible
    const rightScaleOverlayId = selectedVisible ? this.selectedOverlayId : (visibleOverlayIds[0] || null)

    for (const [id, ov] of this.overlayMap) {
      const targetScaleId = (rightScaleOverlayId && id === rightScaleOverlayId)
        ? "right"
        : ov.basePriceScaleId

      if (ov.activePriceScaleId !== targetScaleId) {
        ov.series.applyOptions({ priceScaleId: targetScaleId })
        ov.activePriceScaleId = targetScaleId
      }
    }

    this.chart.applyOptions({
      leftPriceScale: { visible: false },
      rightPriceScale: { visible: !!rightScaleOverlayId },
    })
  }

  // --- Data formatting ---

  _toSeriesData(ov, candles) {
    if (ov.mode === "volume") {
      if (ov.chartType === "Histogram") {
        return candles.map(c => ({
          time: c.time,
          value: c.volume || 0,
          color: this._withAlpha(c.close >= c.open ? ov.colors.up : ov.colors.down, ov.opacity * 0.5),
        }))
      }
      return candles.map(c => ({ time: c.time, value: c.volume || 0 }))
    }
    if (ov.chartType === "Candlestick" || ov.chartType === "Bar") return candles
    return candles.map(c => ({ time: c.time, value: c.close }))
  }

  _toUpdatePoint(ov, candle) {
    if (ov.mode === "volume") {
      if (ov.chartType === "Histogram") {
        return {
          time: candle.time,
          value: candle.volume || 0,
          color: this._withAlpha(candle.close >= candle.open ? ov.colors.up : ov.colors.down, ov.opacity * 0.5),
        }
      }
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
