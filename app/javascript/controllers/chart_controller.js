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
      getTimeRange: () => this._timeRange(),
      onGoStart: () => this._goToStart(),
      onGoEnd: () => {
        this.chart.timeScale().scrollToPosition(0, false)
        requestAnimationFrame(() => this.scrollbar?.update())
      },
      onGoToDate: (ts) => this._navigateToTime(ts),
    })

    this.indicators = new IndicatorManager(this.chart, this.overlayMap, this.timeframeValue, {
      onScaleSync: () => this._syncSelectedOverlayScale(),
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
        const selMeta = selOv.indicatorType ? INDICATOR_META[selOv.indicatorType] : null
        // Oscillators (non-overlay indicators) get their own scale on "right"
        // Overlay indicators follow their source's scale
        if (selMeta && !selMeta.overlay) {
          rightScaleOverlayId = this.selectedOverlayId
        } else {
          rightScaleOverlayId = selOv.pinnedTo || this.selectedOverlayId
        }
      }
    }
    if (!rightScaleOverlayId) {
      rightScaleOverlayId = visibleUnpinned[0] || null
    }

    let rightScaleChanged = false
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
        if (targetScaleId === "right") rightScaleChanged = true
      }
    }
    for (const [id, ov] of this.overlayMap) {
      if (!ov.pinnedTo) continue
      const meta = ov.indicatorType ? INDICATOR_META[ov.indicatorType] : null
      let targetScaleId
      if (meta && !meta.overlay) {
        // Oscillators: "right" if selected, own scale otherwise
        targetScaleId = (rightScaleOverlayId === id) ? "right" : ov.basePriceScaleId
      } else {
        // Overlay indicators follow their source's scale
        const target = this.overlayMap.get(ov.pinnedTo)
        targetScaleId = target
          ? (target.activePriceScaleId || target.basePriceScaleId)
          : ov.basePriceScaleId
      }
      if (ov.activePriceScaleId !== targetScaleId) {
        if (ov.indicatorSeries) {
          ov.indicatorSeries.forEach(s => s.series.applyOptions({ priceScaleId: targetScaleId }))
        } else if (ov.series) {
          ov.series.applyOptions({ priceScaleId: targetScaleId })
        }
        ov.activePriceScaleId = targetScaleId
        if (targetScaleId === "right") rightScaleChanged = true
      }
    }

    this.chart.applyOptions({
      leftPriceScale: { visible: false },
      rightPriceScale: { visible: !!rightScaleOverlayId },
    })

    // Reset auto-scale when a different series moves onto the right axis,
    // so lightweight-charts recalculates the Y-range for the new data.
    if (rightScaleChanged) {
      try { this.chart.priceScale("right").applyOptions({ autoScale: true }) } catch {}
    }

    // Hide custom price scales so only "right" axis is visible
    for (const [, ov] of this.overlayMap) {
      if (ov.activePriceScaleId && ov.activePriceScaleId !== "right") {
        try { this.chart.priceScale(ov.activePriceScaleId).applyOptions({ visible: false }) } catch {}
      }
    }
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
    this.indicators.refreshAll(overlayId)
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
      // Source candles loaded — now compute indicators
      this.indicators.refreshAll()
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
      this.indicators.refreshAll()
    }
  }

  _goToStart() {
    const total = this._maxBarsCount()
    if (total === 0) return
    const range = this.chart.timeScale().getVisibleLogicalRange()
    const visible = range ? range.to - range.from : 100
    this.chart.timeScale().setVisibleLogicalRange({ from: 0, to: visible })
    requestAnimationFrame(() => this.scrollbar?.update())
  }

  async _navigateToTime(targetTime) {
    // Load data starting from that date for each overlay
    for (const [, ov] of this.overlayMap) {
      if (!ov.loader) continue
      const startTime = new Date(targetTime * 1000).toISOString()
      const url = new URL(ov.loader.baseUrl, window.location.origin)
      url.searchParams.set("start_time", startTime)
      url.searchParams.set("limit", "1500")
      try {
        const resp = await fetch(url)
        const newCandles = await resp.json()
        if (newCandles.length === 0) continue
        // Merge: new candles before existing, then existing after
        const existing = ov.loader.candles
        const oldestExisting = existing.length > 0 ? existing[0].time : Infinity
        const before = newCandles.filter(c => c.time < oldestExisting)
        if (before.length > 0) {
          ov.loader.candles = [...before, ...existing]
          ov.loader.oldestTime = ov.loader.candles[0].time
        }
        ov.series.setData(toSeriesData(ov, ov.loader.candles))
      } catch (e) {
        console.error("[nav] load failed:", e)
      }
    }

    // Scroll to the target time
    const firstOv = [...this.overlayMap.values()].find(ov => ov.loader?.candles?.length)
    if (!firstOv) return
    const candles = firstOv.loader.candles
    let idx = candles.findIndex(c => c.time >= targetTime)
    if (idx === -1) idx = candles.length - 1

    const range = this.chart.timeScale().getVisibleLogicalRange()
    const visible = range ? range.to - range.from : 100
    this.chart.timeScale().setVisibleLogicalRange({ from: idx, to: idx + visible })
    this.indicators.refreshAll()
    requestAnimationFrame(() => this.scrollbar?.update())
  }

  _timeRange() {
    let first = Infinity, last = 0
    for (const [, ov] of this.overlayMap) {
      const c = ov.loader?.candles
      if (!c?.length) continue
      if (c[0].time < first) first = c[0].time
      if (c[c.length - 1].time > last) last = c[c.length - 1].time
    }
    return first < Infinity ? { first, last } : null
  }

  _maxBarsCount() {
    let max = 0
    for (const [, ov] of this.overlayMap) {
      if (ov.loader?.candles?.length > max) max = ov.loader.candles.length
    }
    return max
  }
}
