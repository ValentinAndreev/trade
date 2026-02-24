import { Controller } from "@hotwired/stimulus"
import { createChart } from "lightweight-charts"

import { CHART_THEME, OVERLAY_COLORS } from "../chart/theme"
import DataLoader from "../chart/data_loader"
import BitfinexFeed from "../chart/bitfinex_feed"
import CableFeed from "../chart/cable_feed"
import Scrollbar from "../chart/scrollbar"
import { INDICATOR_META } from "../chart/indicators"
import IndicatorManager from "../chart/indicator_manager"
import {
  createOverlaySeries, seriesStyleOverrides,
  normalizeColorScheme, normalizeOpacity,
  toSeriesData, toUpdatePoint, indicatorFieldColors,
} from "../chart/series_factory"

export default class extends Controller {
  static values = {
    timeframe: { type: String, default: "1m" },
    overlays: { type: String, default: "[]" },
  }

  connect() {
    this.overlayMap = new Map()
    this._colorIndex = 0
    this.selectedOverlayId = null

    const configs = this._parseOverlays()
    if (configs.length === 0 || configs.every(c => !c.symbol)) return

    this._initChart()

    const indicatorConfigs = []
    configs.forEach(config => {
      if (!config.symbol) return
      if (config.mode === "indicator") {
        indicatorConfigs.push(config)
      } else {
        this._addOverlayInternal(config)
      }
    })

    this._startFeeds()

    indicatorConfigs.forEach(config => {
      this.indicators.addOverlay(config, this._colorIndex++)
    })
  }

  disconnect() {
    for (const [, ov] of this.overlayMap) {
      ov.bfxFeed?.disconnect()
      ov.cableFeed?.disconnect()
      if (ov.indicatorSeries) {
        ov.indicatorSeries.forEach(s => { try { this.chart.removeSeries(s.series) } catch {} })
      }
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
    if (config.mode === "indicator") {
      this.indicators.addOverlay(config, this._colorIndex++)
      return
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
    if (ov.indicatorSeries) {
      this.indicators.removeSeriesFor(ov)
    } else if (ov.series) {
      this.chart.removeSeries(ov.series)
    }
    this.overlayMap.delete(id)
    if (this.selectedOverlayId === id) this.selectedOverlayId = null
    this._syncSelectedOverlayScale()
  }

  showMode(id, mode) {
    const ov = this.overlayMap.get(id)
    if (!ov || ov.mode === mode) return

    if (ov.indicatorSeries) {
      this.indicators.removeSeriesFor(ov)
      ov.indicatorSeries = null
    }

    if (mode === "indicator") {
      ov.mode = mode
      return
    }

    if (!ov.series && ov.loader) {
      ov.mode = mode
      ov.chartType = mode === "volume" ? "Histogram" : "Candlestick"
      ov.series = createOverlaySeries(this.chart, ov.mode, ov.chartType, ov.colors, ov.activePriceScaleId, ov.visible, ov.opacity)
      if (ov.loader.candles.length > 0) {
        ov.series.setData(toSeriesData(ov, ov.loader.candles))
      }
      this._syncSelectedOverlayScale()
      return
    }

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
    if (ov.indicatorSeries) {
      ov.indicatorSeries.forEach(s => s.series.applyOptions({ visible: normalized }))
    } else if (ov.series) {
      ov.series.applyOptions({ visible: normalized })
    }
    this._syncSelectedOverlayScale()
  }

  setOverlayColorScheme(id, colorScheme) {
    const ov = this.overlayMap.get(id)
    if (!ov) return
    const normalized = normalizeColorScheme(colorScheme, ov.colorScheme)
    if (ov.colorScheme === normalized) return
    ov.colorScheme = normalized
    ov.colorIndex = normalized
    ov.colors = OVERLAY_COLORS[normalized]
    this._applyOverlayStyle(ov)
  }

  setOverlayOpacity(id, opacity) {
    const ov = this.overlayMap.get(id)
    if (!ov) return
    const normalized = normalizeOpacity(opacity, ov.opacity)
    if (ov.opacity === normalized) return
    ov.opacity = normalized
    this._applyOverlayStyle(ov)
  }

  updateIndicator(id, type, params, pinnedTo) {
    this.indicators.updateIndicator(id, type, params, pinnedTo)
  }

  setPinnedTo(id, pinnedTo) {
    this.indicators.setPinnedTo(id, pinnedTo)
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
      rightPriceScale: { visible: true, scaleMargins: { top: 0.05, bottom: 0.05 } },
    })

    this.scrollbar = new Scrollbar(this.element, {
      getVisibleRange: () => this.chart.timeScale().getVisibleLogicalRange(),
      setVisibleRange: (range) => this.chart.timeScale().setVisibleLogicalRange(range),
      getTotalBars: () => this._maxBarsCount(),
    })

    this.indicators = new IndicatorManager(this.chart, this.overlayMap, this.timeframeValue, {
      onScaleSync: () => this._syncSelectedOverlayScale(),
      onCandle: (id, candle) => this._handleCandle(id, candle),
    })
  }

  _addOverlayInternal(config) {
    const colorIndex = normalizeColorScheme(config.colorScheme, this._colorIndex++)
    const colors = OVERLAY_COLORS[colorIndex]
    const mode = config.mode || "price"
    const chartType = config.chartType || (mode === "volume" ? "Histogram" : "Candlestick")
    const visible = config.visible !== false
    const opacity = normalizeOpacity(config.opacity, 1)
    const basePriceScaleId = `overlay-${config.id}`

    const series = createOverlaySeries(this.chart, mode, chartType, colors, basePriceScaleId, visible, opacity)

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

  _applyOverlayStyle(ov) {
    if (!ov) return
    if (ov.indicatorSeries) {
      const meta = INDICATOR_META[ov.indicatorType]
      if (meta) {
        const fieldColors = indicatorFieldColors(ov.colors, meta.fields.length, ov.opacity)
        ov.indicatorSeries.forEach((s, i) => {
          s.series.applyOptions({ color: fieldColors[i] })
        })
      }
      return
    }
    if (!ov.series) return
    const styleOvr = seriesStyleOverrides(ov.mode, ov.chartType, ov.colors, ov.opacity)
    if (Object.keys(styleOvr).length > 0) {
      ov.series.applyOptions(styleOvr)
    }
    if (ov.mode === "volume" && ov.chartType === "Histogram" && ov.loader.candles.length > 0) {
      ov.series.setData(toSeriesData(ov, ov.loader.candles))
    }
  }

  _recreateSeries(id) {
    const ov = this.overlayMap.get(id)
    if (!ov) return
    this.chart.removeSeries(ov.series)
    ov.series = createOverlaySeries(this.chart, ov.mode, ov.chartType, ov.colors, ov.activePriceScaleId, ov.visible, ov.opacity)
    if (ov.loader.candles.length > 0) {
      ov.series.setData(toSeriesData(ov, ov.loader.candles))
    }
    this._syncSelectedOverlayScale()
  }

  _syncSelectedOverlayScale() {
    if (!this.chart) return

    const visibleUnpinned = []
    for (const [id, ov] of this.overlayMap) {
      if (ov.visible && !ov.pinnedTo) visibleUnpinned.push(id)
    }

    let rightScaleOverlayId = null
    if (this.selectedOverlayId && this.overlayMap.has(this.selectedOverlayId)) {
      const selOv = this.overlayMap.get(this.selectedOverlayId)
      if (selOv.visible) {
        rightScaleOverlayId = selOv.pinnedTo || this.selectedOverlayId
      }
    }
    if (!rightScaleOverlayId) {
      rightScaleOverlayId = visibleUnpinned[0] || null
    }

    for (const [id, ov] of this.overlayMap) {
      if (ov.pinnedTo) continue
      const targetScaleId = (rightScaleOverlayId && id === rightScaleOverlayId)
        ? "right"
        : ov.basePriceScaleId
      if (ov.activePriceScaleId !== targetScaleId) {
        if (ov.indicatorSeries) {
          ov.indicatorSeries.forEach(s => s.series.applyOptions({ priceScaleId: targetScaleId }))
        } else if (ov.series) {
          ov.series.applyOptions({ priceScaleId: targetScaleId })
        }
        ov.activePriceScaleId = targetScaleId
      }
    }
    for (const [, ov] of this.overlayMap) {
      if (!ov.pinnedTo) continue
      const target = this.overlayMap.get(ov.pinnedTo)
      const targetScaleId = target
        ? (target.activePriceScaleId || target.basePriceScaleId)
        : ov.basePriceScaleId
      if (ov.activePriceScaleId !== targetScaleId) {
        if (ov.indicatorSeries) {
          ov.indicatorSeries.forEach(s => s.series.applyOptions({ priceScaleId: targetScaleId }))
        } else if (ov.series) {
          ov.series.applyOptions({ priceScaleId: targetScaleId })
        }
        ov.activePriceScaleId = targetScaleId
      }
    }

    this.chart.applyOptions({
      leftPriceScale: { visible: false },
      rightPriceScale: { visible: !!rightScaleOverlayId },
    })
  }

  // --- Realtime ---

  _handleCandle(overlayId, candle) {
    const ov = this.overlayMap.get(overlayId)
    if (!ov) return
    ov.loader.updateCandle(candle)
    if (ov.mode === "indicator" || !ov.series) return
    try {
      ov.series.update(toUpdatePoint(ov, candle))
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
        if (ov.mode !== "indicator") ov.bfxFeed.connect()
      }
    })

    for (const [, ov] of this.overlayMap) {
      if (ov.mode !== "indicator") ov.cableFeed.connect()
    }
  }

  async _loadOverlayData(ov, id) {
    if (!ov.series) return
    try {
      const candles = await ov.loader.loadInitial()
      ov.series.setData(toSeriesData(ov, candles))
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
      if (!ov.series) continue
      const filtered = await ov.loader.loadMoreHistory()
      if (!filtered) continue
      ov.series.setData(toSeriesData(ov, ov.loader.candles))
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
