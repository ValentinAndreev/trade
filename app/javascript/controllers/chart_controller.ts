import { Controller } from "@hotwired/stimulus"
import { createChart, IChartApi, LogicalRange } from "lightweight-charts"

import { CHART_THEME, OVERLAY_COLORS } from "../config/theme"
import DataLoader from "../chart/data_loader"
import BitfinexFeed from "../chart/feeds/bitfinex_feed"
import CableFeed from "../chart/feeds/cable_feed"
import Scrollbar from "../chart/scrollbar"
import { INDICATOR_META } from "../config/indicators"
import IndicatorManager from "../chart/indicator_manager"
import {
  CANDLE_LIMIT, LOAD_MORE_THRESHOLD,
  DEFAULT_VISIBLE_BARS, CHART_SCALE_MARGIN,
} from "../config/constants"
import {
  createOverlaySeries, seriesStyleOverrides,
  toSeriesData, toUpdatePoint, indicatorFieldColors,
} from "../chart/series_factory"
import { normalizeColorScheme, normalizeOpacity } from "../utils/color"
import DrawingManager from "../chart/drawing_manager"
import type { LabelMarker } from "../chart/drawing_manager"
import InteractionHandler from "../chart/interaction_handler"
import ScaleManager from "../chart/scale_manager"
import VolumeProfileManager from "../chart/volume_profile_manager"
import { apiFetch } from "../services/api_fetch"
import type { Candle } from "../types/candle"

export default class extends Controller {
  static values = {
    timeframe: { type: String, default: "1m" },
    overlays: { type: String, default: "[]" },
  } as const

  declare timeframeValue: string
  declare overlaysValue: string

  overlayMap!: Map<string, any>
  private _colorIndex!: number
  selectedOverlayId: string | null = null
  chart!: IChartApi
  chartWrapperEl: HTMLDivElement | null = null
  scrollbar: Scrollbar | null = null
  indicators!: IndicatorManager
  drawings: DrawingManager | null = null
  interaction: InteractionHandler | null = null
  scaleManager: ScaleManager | null = null
  vpManager: VolumeProfileManager | null = null
  private _scrollHandler: ((range: LogicalRange | null) => void) | null = null
  private _loadingMore: boolean = false
  private _onConnectionRestore: ((e: Event) => void) | null = null

  connect() {
    this.overlayMap = new Map()
    this._colorIndex = 0
    this.selectedOverlayId = null

    this._onConnectionRestore = (e: Event) => {
      if ((e as CustomEvent<{ online: boolean }>).detail?.online) this._reloadAllOverlays()
    }
    window.addEventListener("connection:change", this._onConnectionRestore as EventListener)

    const configs = this._parseOverlays()
    if (configs.length === 0 || configs.every(c => !c.symbol)) return

    this._initChart()

    const indicatorConfigs: any[] = []
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
    if (this._onConnectionRestore) {
      window.removeEventListener("connection:change", this._onConnectionRestore as EventListener)
    }
    for (const [, ov] of this.overlayMap) {
      ov.bfxFeed?.disconnect()
      ov.cableFeed?.disconnect()
      if (ov.indicatorSeries) {
        ov.indicatorSeries.forEach((s: any) => { try { this.chart.removeSeries(s.series) } catch (e) { console.warn("[chart] cleanup:", (e as Error).message) } })
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

  hasOverlay(id: string): boolean {
    return this.overlayMap.has(id)
  }

  addOverlay(config: any): void {
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

  removeOverlay(id: string): void {
    const ov = this.overlayMap.get(id)
    if (!ov) return
    ov.bfxFeed?.disconnect()
    ov.cableFeed?.disconnect()
    if (ov.indicatorSeries) this.indicators.removeSeriesFor(ov)
    if (ov.series) {
      try { this.chart.removeSeries(ov.series) } catch (e) { console.warn("[chart] cleanup:", (e as Error).message) }
    }
    this.overlayMap.delete(id)
    if (this.selectedOverlayId === id) this.selectedOverlayId = null
    this._syncSelectedOverlayScale()
  }

  showMode(id: string, mode: string): void {
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

  switchChartType(id: string, chartType: string): void {
    const ov = this.overlayMap.get(id)
    if (!ov || ov.chartType === chartType) return
    ov.chartType = chartType
    this._recreateSeries(id)
  }

  setSelectedOverlayScale(id: string | null): void {
    this.selectedOverlayId = id && this.overlayMap.has(id) ? id : null
    this._syncSelectedOverlayScale()
  }

  setOverlayVisibility(id: string, visible: boolean): void {
    const ov = this.overlayMap.get(id)
    if (!ov) return
    const normalized = visible !== false
    if (ov.visible === normalized) return
    ov.visible = normalized
    if (ov.indicatorSeries) {
      ov.indicatorSeries.forEach((s: any) => s.series.applyOptions({ visible: normalized }))
    } else if (ov.series) {
      ov.series.applyOptions({ visible: normalized })
    }
    this._syncSelectedOverlayScale()
    this.drawings?.refreshAfterVisibilityChange()
  }

  setOverlayColorScheme(id: string, colorScheme: number | string): void {
    const ov = this.overlayMap.get(id)
    if (!ov) return
    const normalized = normalizeColorScheme(colorScheme, ov.colorScheme)
    if (ov.colorScheme === normalized) return
    ov.colorScheme = normalized
    ov.colorIndex = normalized
    ov.colors = OVERLAY_COLORS[normalized]
    this._applyOverlayStyle(ov)
  }

  setOverlayOpacity(id: string, opacity: number | string): void {
    const ov = this.overlayMap.get(id)
    if (!ov) return
    const normalized = normalizeOpacity(opacity, ov.opacity)
    if (ov.opacity === normalized) return
    ov.opacity = normalized
    this._applyOverlayStyle(ov)
  }

  updateIndicator(id: string, type: string, params: Record<string, number>, pinnedTo: string | null, source: string): void {
    this.indicators.updateIndicator(id, type, params, pinnedTo, source)
  }

  hasIndicatorSeries(id: string): boolean {
    const ov = this.overlayMap.get(id)
    return ov?.indicatorSeries?.length > 0
  }

  setPinnedTo(id: string, pinnedTo: string | null): void {
    this.indicators.setPinnedTo(id, pinnedTo)
  }

  // --- Drawing delegations ---

  enterLabelMode() { this.interaction?.enterLabelMode() }
  exitLabelMode() { this.interaction?.exitLabelMode() }
  setLabels(labels: LabelMarker[]): void { this.drawings?.setLabels(labels) }
  setConditionLabels(labels: LabelMarker[]): void { this.drawings?.setConditionLabels(labels) }
  scrollToLabel(time: number): void { this.drawings?.scrollToLabel(time) }

  enterLineMode() { this.interaction?.enterLineMode() }
  exitLineMode() { this.interaction?.exitLineMode() }
  setLines(lines: any[]): void { this.drawings?.setLines(lines) }
  scrollToLine(time: number): void { this.drawings?.scrollToLine(time) }

  enterHLineMode() { this.interaction?.enterHLineMode() }
  exitHLineMode() { this.interaction?.exitHLineMode() }
  setHLines(hlines: any[]): void { this.drawings?.setHLines(hlines) }

  enterVLineMode() { this.interaction?.enterVLineMode() }
  exitVLineMode() { this.interaction?.exitVLineMode() }
  setVLines(vlines: any[]): void { this.drawings?.setVLines(vlines) }

  // --- Volume Profile delegations ---

  get vpEnabled() { return this.vpManager?.enabled || false }
  enableVolumeProfile(opacity: number): void { this.vpManager?.enableVolumeProfile(opacity) }
  disableVolumeProfile(): void { this.vpManager?.disableVolumeProfile() }
  setVolumeProfileOpacity(opacity: number): void { this.vpManager?.setOpacity(opacity) }

  // --- Internal ---

  _parseOverlays(): any[] {
    try { return JSON.parse(this.overlaysValue) } catch { return [] }
  }

  _initChart() {
    const el = this.element as HTMLElement
    Object.assign(el.style, { display: "flex", flexDirection: "column", overflow: "hidden" })

    this.chartWrapperEl = document.createElement("div")
    Object.assign(this.chartWrapperEl.style, { flex: "1", minHeight: "0" })
    el.appendChild(this.chartWrapperEl)

    this.chart = createChart(this.chartWrapperEl, {
      ...CHART_THEME, autoSize: true,
      timeScale: { timeVisible: true, secondsVisible: false },
      leftPriceScale: { visible: false },
      rightPriceScale: { visible: true, scaleMargins: { top: CHART_SCALE_MARGIN, bottom: CHART_SCALE_MARGIN } },
    })

    this.scrollbar = new Scrollbar(el, {
      getVisibleRange: () => this.chart.timeScale().getVisibleLogicalRange(),
      setVisibleRange: (range) => this.chart.timeScale().setVisibleLogicalRange(range),
      getTotalBars: () => this._maxBarsCount(),
      getTimeRange: () => this._timeRange() ?? { first: 0, last: 0 },
      onGoStart: () => this._goToStart(),
      onGoEnd: () => {
        this.chart.timeScale().scrollToPosition(0, false)
        requestAnimationFrame(() => this.scrollbar?.update())
      },
      onGoToDate: (ts: number) => this._navigateToTime(ts),
    })

    this.indicators = new IndicatorManager(this.chart, this.overlayMap, this.timeframeValue, {
      onScaleSync: () => this._syncSelectedOverlayScale(),
    })

    this.drawings = new DrawingManager(this.chart, this.overlayMap)
    this.interaction = new InteractionHandler(this.chart, this.overlayMap, el)
    this.scaleManager = new ScaleManager(this.chart, this.overlayMap)
    this.vpManager = new VolumeProfileManager(this.chart, this.overlayMap)
  }

  _addOverlayInternal(config: any): void {
    const colorIndex = normalizeColorScheme(config.colorScheme, this._colorIndex++)
    const colors = OVERLAY_COLORS[colorIndex]
    const mode = config.mode || "price"
    const chartType = config.chartType || (mode === "volume" ? "Histogram" : "Candlestick")
    const visible = config.visible !== false
    const opacity = normalizeOpacity(config.opacity, 1)
    const basePriceScaleId = `overlay-${config.id}`

    const series = createOverlaySeries(this.chart, mode, chartType, colors, basePriceScaleId, visible, opacity)
    const url = `/api/candles?symbol=${encodeURIComponent(config.symbol)}&timeframe=${encodeURIComponent(this.timeframeValue)}&limit=${CANDLE_LIMIT}`
    const loader = new DataLoader(url, config.symbol, this.timeframeValue)
    const onCandle = (candle: Candle) => this._handleCandle(config.id, candle)
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

  _applyOverlayStyle(ov: any): void {
    if (!ov) return
    if (ov.indicatorSeries) {
      const meta = INDICATOR_META[ov.indicatorType]
      if (meta) {
        const fieldColors = indicatorFieldColors(ov.colors, meta.fields.length, ov.opacity)
        ov.indicatorSeries.forEach((s: any, i: number) => { s.series.applyOptions({ color: fieldColors[i] }) })
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

  _recreateSeries(id: string): void {
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

  _handleCandle(overlayId: string, candle: Candle): void {
    const ov = this.overlayMap.get(overlayId)
    if (!ov) return
    ov.loader.updateCandle(candle)
    if (ov.mode === "indicator" || !ov.series) return
    try { ov.series.update(toUpdatePoint(ov, candle)) } catch (e) {
      console.log("[chart] update skipped:", (e as Error).message)
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
      this.drawings?.refreshLabels()
    })
    for (const [, ov] of this.overlayMap) {
      if (ov.mode !== "indicator") ov.cableFeed.connect()
    }
  }

  async _loadOverlayData(ov: any, id: string): Promise<void> {
    if (!ov.series) return
    try {
      const candles = await ov.loader.loadInitial()
      ov.series.setData(toSeriesData(ov, candles))
    } catch (error) {
      console.error(`Failed to load data for overlay ${id}:`, (error as Error).message)
    }
  }

  _subscribeToScroll() {
    this._scrollHandler = (range: LogicalRange | null) => {
      if (!range) return
      this.scrollbar?.update()
      if (range.from < LOAD_MORE_THRESHOLD) this._loadMoreHistory()
    }
    this.chart.timeScale().subscribeVisibleLogicalRangeChange(this._scrollHandler)
    const range = this.chart.timeScale().getVisibleLogicalRange()
    if (range && range.from < LOAD_MORE_THRESHOLD) this._loadMoreHistory()
  }

  async _loadMoreHistory() {
    if (this._loadingMore) return
    this._loadingMore = true
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
    this._loadingMore = false
  }

  _goToStart() {
    const total = this._maxBarsCount()
    if (total === 0) return
    const range = this.chart.timeScale().getVisibleLogicalRange()
    const visible = range ? range.to - range.from : DEFAULT_VISIBLE_BARS
    this.chart.timeScale().setVisibleLogicalRange({ from: 0, to: visible })
    requestAnimationFrame(() => this.scrollbar?.update())
  }

  async _navigateToTime(targetTime: number): Promise<void> {
    const firstOv = [...this.overlayMap.values()].find(ov => ov.loader?.candles?.length)
    if (!firstOv) return

    const candles = firstOv.loader.candles
    const oldest = candles[0]?.time ?? Infinity
    const needsFetch = targetTime < oldest

    if (needsFetch) {
      for (const [, ov] of this.overlayMap) {
        if (!ov.loader) continue
        const startTime = new Date(targetTime * 1000).toISOString()
        const url = new URL(ov.loader.baseUrl, window.location.origin)
        url.searchParams.set("start_time", startTime)
        url.searchParams.set("limit", String(CANDLE_LIMIT))
        try {
          const resp = await apiFetch(url, {}, { silent: true })
          if (!resp) continue
          const newCandles = await resp.json()
          if (newCandles.length === 0) continue
          ov.loader.prependCandles(newCandles)
          ov.series.setData(toSeriesData(ov, ov.loader.candles))
        } catch (e) { console.error("[nav] load failed:", (e as Error).message) }
      }
      this.indicators.refreshAll()
    }

    const allCandles = firstOv.loader.candles
    let idx = allCandles.findIndex((c: Candle) => c.time >= targetTime)
    if (idx === -1) idx = allCandles.length - 1
    const range = this.chart.timeScale().getVisibleLogicalRange()
    const visible = range ? range.to - range.from : DEFAULT_VISIBLE_BARS
    this.chart.timeScale().setVisibleLogicalRange({ from: idx, to: idx + visible })
    if (!needsFetch) this.indicators.refreshAll()
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
        console.error(`[reconnect] reload failed for overlay ${id}:`, (e as Error).message)
      }
    }
    this.indicators.refreshAll()
    requestAnimationFrame(() => this.scrollbar?.update())
  }

  applyColorZones(zones: Array<{ time: number; color: string }>): void {
    const zoneMap = new Map<number, string>()
    for (const z of zones) zoneMap.set(z.time, z.color)

    for (const [, ov] of this.overlayMap) {
      if (ov.mode !== "price" || !ov.series || !ov.loader?.candles?.length) continue
      const coloredData = ov.loader.candles.map((c: any) => {
        const zone = zoneMap.get(c.time)
        if (zone) {
          return {
            ...toUpdatePoint(ov, c),
            color: zone,
            borderColor: zone,
            wickUpColor: zone,
            wickDownColor: zone,
          }
        }
        return toUpdatePoint(ov, c)
      })
      try { ov.series.setData(coloredData) } catch (e) {
        console.warn("[chart] color zone apply failed:", (e as Error).message)
      }
    }
  }
}
