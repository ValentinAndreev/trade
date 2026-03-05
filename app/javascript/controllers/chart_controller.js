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
  toSeriesData, toUpdatePoint, indicatorFieldColors,
} from "../chart/series_factory"
import { normalizeColorScheme, normalizeOpacity } from "../utils/color"
import DrawingManager from "../chart/drawing_manager"
import InteractionHandler from "../chart/interaction_handler"
import ScaleManager from "../chart/scale_manager"
import VolumeProfileManager from "../chart/volume_profile_manager"
import { apiFetch } from "../services/api_fetch"

export default class extends Controller {
  static values = {
    timeframe: { type: String, default: "1m" },
    overlays: { type: String, default: "[]" },
  }

  connect() {
    this.overlayMap = new Map()
    this._colorIndex = 0
    this.selectedOverlayId = null

    this._onConnectionRestore = (e) => {
      if (e.detail.online) this._reloadAllOverlays()
    }
    window.addEventListener("connection:change", this._onConnectionRestore)

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
    window.removeEventListener("connection:change", this._onConnectionRestore)
    for (const [, ov] of this.overlayMap) {
      ov.bfxFeed?.disconnect()
      ov.cableFeed?.disconnect()
      if (ov.indicatorSeries) {
        ov.indicatorSeries.forEach(s => { try { this.chart.removeSeries(s.series) } catch {} })
      }
    }
    if (this._scrollHandler) {
      this.chart?.timeScale().unsubscribeVisibleLogicalRangeChange(this._scrollHandler)
    }
    this.interaction?.destroy()
    this.drawings?.destroy()
    this.vpManager?.destroy()
    this.scrollbar?.destroy()
    this.chart?.remove()
    this.chartWrapperEl?.remove()
    this.overlayMap.clear()
  }

  // --- Public API for tabs_controller ---

  addOverlay(config) {
    if (!this.chart) this._initChart()
    if (config.mode === "indicator") {
      this.indicators.addOverlay(config, this._colorIndex++)
      return
    }
    this._addOverlayInternal(config)
    const ov = this.overlayMap.get(config.id)
    if (ov) {
      this._loadOverlayData(ov, config.id).then(() => { ov.bfxFeed.connect() })
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

    // Remove indicator series if switching away from indicator
    if (ov.indicatorSeries) { this.indicators.removeSeriesFor(ov); ov.indicatorSeries = null }

    if (mode === "indicator") {
      // Hide price/volume series when switching to indicator
      if (ov.series) ov.series.applyOptions({ visible: false })
      ov.mode = mode
      return
    }

    // Switching to price or volume — show/recreate the base series
    ov.mode = mode
    if (ov.series) {
      ov.series.applyOptions({ visible: ov.visible !== false })
      this._recreateSeries(id)
    } else if (ov.loader) {
      ov.chartType = mode === "volume" ? "Histogram" : "Candlestick"
      ov.series = createOverlaySeries(this.chart, ov.mode, ov.chartType, ov.colors, ov.activePriceScaleId, ov.visible, ov.opacity)
      if (ov.loader.candles.length > 0) ov.series.setData(toSeriesData(ov, ov.loader.candles))
    }
    this._syncSelectedOverlayScale()
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
    this.drawings?.refreshAfterVisibilityChange()
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

  updateIndicator(id, type, params, pinnedTo, source) {
    this.indicators.updateIndicator(id, type, params, pinnedTo, source)
  }

  hasIndicatorSeries(id) {
    const ov = this.overlayMap.get(id)
    return ov?.indicatorSeries?.length > 0
  }

  setPinnedTo(id, pinnedTo) {
    this.indicators.setPinnedTo(id, pinnedTo)
  }

  // --- Drawing delegations ---

  enterLabelMode() { this.interaction?.enterLabelMode() }
  exitLabelMode() { this.interaction?.exitLabelMode() }
  setLabels(labels) { this.drawings?.setLabels(labels) }
  scrollToLabel(time) { this.drawings?.scrollToLabel(time) }

  enterLineMode() { this.interaction?.enterLineMode() }
  exitLineMode() { this.interaction?.exitLineMode() }
  setLines(lines) { this.drawings?.setLines(lines) }
  scrollToLine(time) { this.drawings?.scrollToLine(time) }

  enterHLineMode() { this.interaction?.enterHLineMode() }
  exitHLineMode() { this.interaction?.exitHLineMode() }
  setHLines(hlines) { this.drawings?.setHLines(hlines) }

  enterVLineMode() { this.interaction?.enterVLineMode() }
  exitVLineMode() { this.interaction?.exitVLineMode() }
  setVLines(vlines) { this.drawings?.setVLines(vlines) }

  // --- Volume Profile delegations ---

  get vpEnabled() { return this.vpManager?.enabled || false }
  enableVolumeProfile(opacity) { this.vpManager?.enableVolumeProfile(opacity) }
  disableVolumeProfile() { this.vpManager?.disableVolumeProfile() }
  setVolumeProfileOpacity(opacity) { this.vpManager?.setOpacity(opacity) }

  // --- Internal ---

  _parseOverlays() {
    try { return JSON.parse(this.overlaysValue) } catch { return [] }
  }

  _initChart() {
    Object.assign(this.element.style, { display: "flex", flexDirection: "column", overflow: "hidden" })

    this.chartWrapperEl = document.createElement("div")
    Object.assign(this.chartWrapperEl.style, { flex: "1", minHeight: "0" })
    this.element.appendChild(this.chartWrapperEl)

    this.chart = createChart(this.chartWrapperEl, {
      ...CHART_THEME, autoSize: true,
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

    this.drawings = new DrawingManager(this.chart, this.overlayMap)
    this.interaction = new InteractionHandler(this.chart, this.overlayMap, this.element)
    this.scaleManager = new ScaleManager(this.chart, this.overlayMap)
    this.vpManager = new VolumeProfileManager(this.chart, this.overlayMap)
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
        ov.indicatorSeries.forEach((s, i) => { s.series.applyOptions({ color: fieldColors[i] }) })
      }
      return
    }
    if (!ov.series) return
    const styleOvr = seriesStyleOverrides(ov.mode, ov.chartType, ov.colors, ov.opacity)
    if (Object.keys(styleOvr).length > 0) ov.series.applyOptions(styleOvr)
    if (ov.mode === "volume" && ov.chartType === "Histogram" && ov.loader.candles.length > 0) {
      ov.series.setData(toSeriesData(ov, ov.loader.candles))
    }
  }

  _recreateSeries(id) {
    const ov = this.overlayMap.get(id)
    if (!ov) return
    this.chart.removeSeries(ov.series)
    ov.series = createOverlaySeries(this.chart, ov.mode, ov.chartType, ov.colors, ov.activePriceScaleId, ov.visible, ov.opacity)
    if (ov.loader.candles.length > 0) ov.series.setData(toSeriesData(ov, ov.loader.candles))
    this._syncSelectedOverlayScale()
    this.drawings?.refreshLabels()
  }

  _syncSelectedOverlayScale() {
    this.scaleManager?.syncSelectedOverlayScale(this.selectedOverlayId)
  }

  // --- Realtime ---

  _handleCandle(overlayId, candle) {
    const ov = this.overlayMap.get(overlayId)
    if (!ov) return
    ov.loader.updateCandle(candle)
    if (ov.mode === "indicator" || !ov.series) return
    try { ov.series.update(toUpdatePoint(ov, candle)) } catch (e) {
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
      this.indicators.refreshAll()
      this.drawings?._renderLabelMarkers()
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
    this._scrollHandler = (range) => {
      if (!range) return
      this.scrollbar?.update()
      if (range.from < 50) this._loadMoreHistory()
    }
    this.chart.timeScale().subscribeVisibleLogicalRangeChange(this._scrollHandler)
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
    for (const [, ov] of this.overlayMap) {
      if (!ov.loader) continue
      const startTime = new Date(targetTime * 1000).toISOString()
      const url = new URL(ov.loader.baseUrl, window.location.origin)
      url.searchParams.set("start_time", startTime)
      url.searchParams.set("limit", "1500")
      try {
        const resp = await apiFetch(url, {}, { silent: true })
        if (!resp) continue
        const newCandles = await resp.json()
        if (newCandles.length === 0) continue
        ov.loader.prependCandles(newCandles)
        ov.series.setData(toSeriesData(ov, ov.loader.candles))
      } catch (e) { console.error("[nav] load failed:", e) }
    }
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

  async _reloadAllOverlays() {
    for (const [id, ov] of this.overlayMap) {
      if (!ov.loader || !ov.series) continue
      try {
        const candles = await ov.loader.loadInitial()
        if (candles.length > 0) ov.series.setData(toSeriesData(ov, candles))
      } catch (e) {
        console.error(`[reconnect] reload failed for overlay ${id}:`, e)
      }
    }
    this.indicators.refreshAll()
    requestAnimationFrame(() => this.scrollbar?.update())
  }
}
