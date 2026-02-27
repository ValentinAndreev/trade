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
import { TrendLinePrimitive } from "../chart/trend_line"
import { VolumeProfilePrimitive } from "../chart/volume_profile"
import { HLinePrimitive, VLinePrimitive } from "../chart/guide_lines"
import { TextLabelsPrimitive } from "../chart/text_labels"

export default class extends Controller {
  static values = {
    timeframe: { type: String, default: "1m" },
    overlays: { type: String, default: "[]" },
  }

  connect() {
    this.overlayMap = new Map()
    this._colorIndex = 0
    this.selectedOverlayId = null
    this.labelMode = false
    this.labels = []
    this._labelMarkersPrimitives = []
    this._labelInputEl = null
    this._labelTooltipEl = null

    this.lineMode = false
    this._lineDrawState = null   // { step: "second", p1: {time, price, overlayId, symbol, mode, modeDetail} }
    this._linePrimitives = []    // [{ id, primitive, seriesRef }]
    this._linePreviewPrimitive = null
    this._linePreviewSeriesRef = null

    this.hlMode = false
    this.vlMode = false
    this._hlinePrimitives = []   // [{ id, primitive, seriesRef }]
    this._vlinePrimitives = []   // [{ id, primitive, seriesRef }]

    this._vpEnabled = false
    this._vpOpacity = 0.3
    this._vpPrimitive = null
    this._vpSeriesRef = null
    this._vpRangeHandler = null
    this._vpRafId = null

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
    if (this._clickHandler) {
      this.chart?.unsubscribeClick(this._clickHandler)
    }
    if (this._crosshairHandler) {
      this.chart?.unsubscribeCrosshairMove(this._crosshairHandler)
    }
    this._removeLabelInput()
    this._removeLabelTooltip()
    this._removeLinePreview()
    this._detachAllLinePrimitives()
    this._detachAllHLinePrimitives()
    this._detachAllVLinePrimitives()
    this._detachVolumeProfile()
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
    // Re-render markers (labels/lines on hidden series should disappear)
    if (this.labels?.length > 0) this._renderLabelMarkers()
    if (this._linePrimitives.length > 0 || this._storedLines?.length > 0) {
      this.setLines(this._storedLines || [])
    }
    if (this._hlinePrimitives.length > 0 || this._storedHLines?.length > 0) {
      this.setHLines(this._storedHLines || [])
    }
    if (this._vlinePrimitives.length > 0 || this._storedVLines?.length > 0) {
      this.setVLines(this._storedVLines || [])
    }
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

  // --- Label mode ---

  enterLabelMode() {
    if (!this.chart) return
    this.labelMode = true
    this._ensureChartSubscriptions()
    this.element.style.cursor = "crosshair"
  }

  exitLabelMode() {
    this.labelMode = false
    this._removeLabelInput()
    this._removeLabelTooltip()
    if (!this._anyInteractiveMode()) {
      if (this._crosshairHandler) {
        this.chart?.unsubscribeCrosshairMove(this._crosshairHandler)
        this._crosshairHandler = null
      }
    }
    this.element.style.cursor = this._anyInteractiveMode() ? "crosshair" : ""
  }

  setLabels(labels) {
    this.labels = labels || []
    this._renderLabelMarkers()
  }

  scrollToLabel(time) {
    if (!this.chart) return
    const firstOv = [...this.overlayMap.values()].find(ov => ov.loader?.candles?.length)
    if (!firstOv) return
    const candles = firstOv.loader.candles
    let idx = candles.findIndex(c => c.time >= time)
    if (idx === -1) idx = candles.length - 1
    const range = this.chart.timeScale().getVisibleLogicalRange()
    const visible = range ? range.to - range.from : 100
    const from = Math.max(0, idx - Math.floor(visible / 2))
    this.chart.timeScale().setVisibleLogicalRange({ from, to: from + visible })
  }

  // --- Line mode ---

  enterLineMode() {
    if (!this.chart) return
    this.lineMode = true
    this._ensureChartSubscriptions()
    this.element.style.cursor = "crosshair"
  }

  exitLineMode() {
    this.lineMode = false
    this._lineDrawState = null
    this._removeLabelTooltip()
    this._removeLinePreview()
    if (!this._anyInteractiveMode()) {
      if (this._crosshairHandler) {
        this.chart?.unsubscribeCrosshairMove(this._crosshairHandler)
        this._crosshairHandler = null
      }
    }
    this.element.style.cursor = this._anyInteractiveMode() ? "crosshair" : ""
  }

  setLines(lines) {
    this._storedLines = lines || []
    this._detachAllLinePrimitives()
    if (!lines || lines.length === 0) return
    for (const line of lines) {
      this._attachLinePrimitive(line)
    }
  }

  scrollToLine(time) {
    if (!this.chart) return
    const t = typeof time === "number" ? time : (time?.time || 0)
    this.scrollToLabel(t)
  }

  // --- HLine mode ---

  enterHLineMode() {
    if (!this.chart) return
    this.hlMode = true
    this._ensureChartSubscriptions()
    this.element.style.cursor = "crosshair"
  }

  exitHLineMode() {
    this.hlMode = false
    this._removeLabelTooltip()
    if (!this._anyInteractiveMode()) {
      if (this._crosshairHandler) {
        this.chart?.unsubscribeCrosshairMove(this._crosshairHandler)
        this._crosshairHandler = null
      }
    }
    this.element.style.cursor = this._anyInteractiveMode() ? "crosshair" : ""
  }

  setHLines(hlines) {
    this._storedHLines = hlines || []
    this._detachAllHLinePrimitives()
    if (!hlines || hlines.length === 0) return
    for (const hl of hlines) {
      this._attachHLinePrimitive(hl)
    }
  }

  // --- VLine mode ---

  enterVLineMode() {
    if (!this.chart) return
    this.vlMode = true
    this._ensureChartSubscriptions()
    this.element.style.cursor = "crosshair"
  }

  exitVLineMode() {
    this.vlMode = false
    this._removeLabelTooltip()
    if (!this._anyInteractiveMode()) {
      if (this._crosshairHandler) {
        this.chart?.unsubscribeCrosshairMove(this._crosshairHandler)
        this._crosshairHandler = null
      }
    }
    this.element.style.cursor = this._anyInteractiveMode() ? "crosshair" : ""
  }

  setVLines(vlines) {
    this._storedVLines = vlines || []
    this._detachAllVLinePrimitives()
    if (!vlines || vlines.length === 0) return
    for (const vl of vlines) {
      this._attachVLinePrimitive(vl)
    }
  }

  // --- Volume Profile ---

  enableVolumeProfile(opacity) {
    if (!this.chart) return
    if (typeof opacity === "number") this._vpOpacity = opacity

    // Find first price series to attach to
    const series = this._findFirstPriceSeries()
    if (!series) return

    this._vpPrimitive = new VolumeProfilePrimitive({ opacity: this._vpOpacity })
    series.attachPrimitive(this._vpPrimitive)
    this._vpSeriesRef = series
    this._vpEnabled = true

    this._vpRangeHandler = () => this._scheduleVpUpdate()
    this.chart.timeScale().subscribeVisibleLogicalRangeChange(this._vpRangeHandler)
    this._updateVolumeProfile()
  }

  disableVolumeProfile() {
    this._detachVolumeProfile()
  }

  setVolumeProfileOpacity(opacity) {
    this._vpOpacity = opacity
    if (this._vpPrimitive) this._vpPrimitive.setOpacity(opacity)
  }

  _detachVolumeProfile() {
    if (this._vpRangeHandler && this.chart) {
      this.chart.timeScale().unsubscribeVisibleLogicalRangeChange(this._vpRangeHandler)
    }
    if (this._vpPrimitive && this._vpSeriesRef) {
      try { this._vpSeriesRef.detachPrimitive(this._vpPrimitive) } catch {}
    }
    if (this._vpRafId) cancelAnimationFrame(this._vpRafId)
    this._vpPrimitive = null
    this._vpSeriesRef = null
    this._vpRangeHandler = null
    this._vpRafId = null
    this._vpEnabled = false
  }

  _findFirstPriceSeries() {
    for (const [, ov] of this.overlayMap) {
      if (ov.mode !== "indicator" && ov.series && ov.visible) return ov.series
    }
    return null
  }

  _scheduleVpUpdate() {
    if (this._vpRafId) return
    this._vpRafId = requestAnimationFrame(() => {
      this._vpRafId = null
      this._updateVolumeProfile()
    })
  }

  _updateVolumeProfile() {
    if (!this._vpPrimitive || !this.chart) return

    const range = this.chart.timeScale().getVisibleLogicalRange()
    if (!range) return

    const from = Math.max(0, Math.floor(range.from))
    const to = Math.ceil(range.to)

    // Find first overlay with candles
    let candles = null
    for (const [, ov] of this.overlayMap) {
      if (ov.mode !== "indicator" && ov.loader?.candles?.length > 0) {
        candles = ov.loader.candles
        break
      }
    }
    if (!candles || candles.length === 0) return

    const sliceFrom = Math.max(0, from)
    const sliceTo = Math.min(candles.length, to)
    if (sliceFrom >= sliceTo) return

    const visible = candles.slice(sliceFrom, sliceTo)
    const rows = this._computeVolumeProfile(visible, 50)
    this._vpPrimitive.setData(rows)
  }

  _computeVolumeProfile(candles, numRows) {
    if (!candles || candles.length === 0) return []

    let minLow = Infinity, maxHigh = -Infinity
    for (const c of candles) {
      if (c.low < minLow) minLow = c.low
      if (c.high > maxHigh) maxHigh = c.high
    }
    if (minLow >= maxHigh) return []

    const binSize = (maxHigh - minLow) / numRows
    const bins = new Array(numRows).fill(0)

    for (const c of candles) {
      const vol = c.volume || 0
      if (vol === 0) continue
      const lo = Math.max(0, Math.floor((c.low - minLow) / binSize))
      const hi = Math.min(numRows - 1, Math.floor((c.high - minLow) / binSize))
      const numBins = hi - lo + 1
      const perBin = vol / numBins
      for (let i = lo; i <= hi; i++) {
        bins[i] += perBin
      }
    }

    const rows = []
    for (let i = 0; i < numRows; i++) {
      if (bins[i] === 0) continue
      rows.push({ price: minLow + (i + 0.5) * binSize, volume: bins[i] })
    }
    return rows
  }

  _ensureChartSubscriptions() {
    if (!this._clickHandler) {
      this._clickHandler = (param) => this._onChartClick(param)
      this.chart.subscribeClick(this._clickHandler)
    }
    if (!this._crosshairHandler) {
      this._crosshairHandler = (param) => this._onCrosshairMove(param)
      this.chart.subscribeCrosshairMove(this._crosshairHandler)
    }
  }

  _attachLinePrimitive(line) {
    const series = this._findVisibleSeriesForMarkers(line.overlayId)
    if (!series) return
    const primitive = new TrendLinePrimitive(line.p1, line.p2, {
      color: line.color || "#2196f3",
      width: line.width || 2,
    })
    series.attachPrimitive(primitive)
    this._linePrimitives.push({ id: line.id, primitive, seriesRef: series })
  }

  _detachAllLinePrimitives() {
    for (const entry of this._linePrimitives) {
      try { entry.seriesRef.detachPrimitive(entry.primitive) } catch {}
    }
    this._linePrimitives = []
  }

  _removeLinePreview() {
    if (this._linePreviewPrimitive && this._linePreviewSeriesRef) {
      try { this._linePreviewSeriesRef.detachPrimitive(this._linePreviewPrimitive) } catch {}
    }
    this._linePreviewPrimitive = null
    this._linePreviewSeriesRef = null
  }

  _showLinePreview(p1, currentPoint, series) {
    if (!this._linePreviewPrimitive) {
      this._linePreviewPrimitive = new TrendLinePrimitive(p1, currentPoint, {
        color: "#2196f3",
        width: 2,
        dash: [5, 4],
      })
      series.attachPrimitive(this._linePreviewPrimitive)
      this._linePreviewSeriesRef = series
    } else {
      this._linePreviewPrimitive.updatePoints(p1, currentPoint)
    }
  }

  _onChartClick(param) {
    // Line mode takes priority
    if (this.lineMode) {
      this._onLineClick(param)
      return
    }
    if (this.hlMode) {
      this._onHLineClick(param)
      return
    }
    if (this.vlMode) {
      this._onVLineClick(param)
      return
    }
    if (!this.labelMode) return
    if (!param.point) return

    const time = param.time
    if (!time) return

    const target = this._findNearestSeries(param)
    if (!target) return

    const price = target.series.coordinateToPrice(param.point.y)
    if (price === null || !Number.isFinite(price)) return

    this._removeLabelTooltip()
    const modeDetail = this._overlayModeStr(target.ov)
    this._showLabelInput(param.point.x, param.point.y, time, price, target.id, target.ov.symbol || "", target.ov.mode || "price", modeDetail)
  }

  _onCrosshairMove(param) {
    const anyMode = this._anyInteractiveMode()
    if (!anyMode || !param.point) {
      this._removeLabelTooltip()
      return
    }
    if (this._labelInputEl) return

    const time = param.time
    if (!time) { this._removeLabelTooltip(); return }

    const target = this._findNearestSeries(param)
    if (!target) { this._removeLabelTooltip(); return }

    const text = `${target.ov.symbol || "?"} ${this._overlayModeStr(target.ov)}`
    this._showLabelTooltip(param.point.x, param.point.y, text)

    // Line preview: show dashed line from p1 to cursor position
    // Always use the locked series from the first click for consistent coordinates
    if (this.lineMode && this._lineDrawState?.step === "second") {
      const lockedSeries = this._lineDrawState.series
      const price = lockedSeries.coordinateToPrice(param.point.y)
      if (price !== null && Number.isFinite(price)) {
        this._showLinePreview(
          this._lineDrawState.p1,
          { time, price },
          lockedSeries,
        )
      }
    }
  }

  _onLineClick(param) {
    if (!param.point) return
    const time = param.time
    if (!time) return

    const target = this._findNearestSeries(param)
    if (!target) return

    const price = target.series.coordinateToPrice(param.point.y)
    if (price === null || !Number.isFinite(price)) return

    const modeDetail = this._overlayModeStr(target.ov)

    if (!this._lineDrawState) {
      // First click — save p1 and lock the series reference
      this._lineDrawState = {
        step: "second",
        p1: { time, price },
        overlayId: target.id,
        symbol: target.ov.symbol || "",
        mode: target.ov.mode || "price",
        modeDetail,
        series: target.series,
      }
      this._removeLabelTooltip()
      return
    }

    // Second click — compute p2 price through the SAME series as p1
    const state = this._lineDrawState
    const p1 = state.p1
    const p2Price = state.series.coordinateToPrice(param.point.y)
    if (p2Price === null || !Number.isFinite(p2Price)) return
    const p2 = { time, price: p2Price }

    this._removeLinePreview()
    this._lineDrawState = null
    this._removeLabelTooltip()

    this.element.dispatchEvent(new CustomEvent("line:created", {
      detail: {
        p1, p2,
        color: "#2196f3",
        width: 2,
        overlayId: state.overlayId,
        symbol: state.symbol,
        mode: state.mode,
        modeDetail: state.modeDetail,
      },
      bubbles: true,
    }))
  }

  _onHLineClick(param) {
    if (!param.point) return
    const time = param.time
    if (!time) return
    const target = this._findNearestSeries(param)
    if (!target) return
    const price = target.series.coordinateToPrice(param.point.y)
    if (price === null || !Number.isFinite(price)) return
    this._removeLabelTooltip()
    this.element.dispatchEvent(new CustomEvent("hline:created", {
      detail: {
        price,
        color: "#ff9800",
        width: 1,
        overlayId: target.id,
        symbol: target.ov.symbol || "",
        mode: target.ov.mode || "price",
        modeDetail: this._overlayModeStr(target.ov),
      },
      bubbles: true,
    }))
  }

  _onVLineClick(param) {
    if (!param.point) return
    const time = param.time
    if (!time) return
    const target = this._findNearestSeries(param)
    if (!target) return
    this._removeLabelTooltip()
    this.element.dispatchEvent(new CustomEvent("vline:created", {
      detail: {
        time,
        color: "#ff9800",
        width: 1,
        overlayId: target.id,
        symbol: target.ov.symbol || "",
        mode: target.ov.mode || "price",
        modeDetail: this._overlayModeStr(target.ov),
      },
      bubbles: true,
    }))
  }

  _attachHLinePrimitive(hl) {
    const series = this._findVisibleSeriesForMarkers(hl.overlayId)
    if (!series) return
    const primitive = new HLinePrimitive(hl.price, {
      color: hl.color || "#ff9800",
      width: hl.width || 1,
    })
    series.attachPrimitive(primitive)
    this._hlinePrimitives.push({ id: hl.id, primitive, seriesRef: series })
  }

  _detachAllHLinePrimitives() {
    for (const entry of this._hlinePrimitives) {
      try { entry.seriesRef.detachPrimitive(entry.primitive) } catch {}
    }
    this._hlinePrimitives = []
  }

  _attachVLinePrimitive(vl) {
    // VLines need any visible series to attach to (for the primitive API)
    const series = this._findVisibleSeriesForMarkers(vl.overlayId) || this._findFirstPriceSeries()
    if (!series) return
    const primitive = new VLinePrimitive(vl.time, {
      color: vl.color || "#ff9800",
      width: vl.width || 1,
    })
    series.attachPrimitive(primitive)
    this._vlinePrimitives.push({ id: vl.id, primitive, seriesRef: series })
  }

  _detachAllVLinePrimitives() {
    for (const entry of this._vlinePrimitives) {
      try { entry.seriesRef.detachPrimitive(entry.primitive) } catch {}
    }
    this._vlinePrimitives = []
  }

  _anyInteractiveMode() {
    return this.labelMode || this.lineMode || this.hlMode || this.vlMode
  }

  _overlayModeStr(ov) {
    if (ov.mode === "indicator") {
      return (ov.indicatorType || "ind").toUpperCase()
    }
    return ov.mode === "volume" ? "Vol" : "Price"
  }

  _showLabelTooltip(x, y, text) {
    if (!this._labelTooltipEl) {
      this._labelTooltipEl = document.createElement("div")
      this._labelTooltipEl.className = "absolute z-40 px-2 py-0.5 text-xs text-gray-300 bg-[#1a1a2e]/90 border border-[#3a3a4e] rounded pointer-events-none whitespace-nowrap"
      this.element.appendChild(this._labelTooltipEl)
    }
    this._labelTooltipEl.textContent = text
    this._labelTooltipEl.style.left = `${x + 12}px`
    this._labelTooltipEl.style.top = `${y - 8}px`
  }

  _removeLabelTooltip() {
    if (this._labelTooltipEl) {
      this._labelTooltipEl.remove()
      this._labelTooltipEl = null
    }
  }

  _showLabelInput(x, y, time, price, overlayId, symbol, mode, modeDetail) {
    this._removeLabelInput()

    const input = document.createElement("input")
    input.type = "text"
    input.placeholder = "Label text..."
    input.className = "absolute z-50 px-2 py-1 text-sm text-white bg-[#1a1a2e] border border-blue-400 rounded outline-none"
    input.style.left = `${x}px`
    input.style.top = `${y - 30}px`
    input.style.width = "160px"

    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        const text = input.value.trim()
        if (text) {
          const label = { text, time, price, color: "#ffffff", overlayId, symbol, mode, modeDetail }
          this.element.dispatchEvent(new CustomEvent("label:created", {
            detail: label,
            bubbles: true,
          }))
        }
        this._removeLabelInput()
      } else if (e.key === "Escape") {
        this._removeLabelInput()
      }
    })

    input.addEventListener("blur", () => {
      setTimeout(() => this._removeLabelInput(), 150)
    })

    this.element.appendChild(input)
    this._labelInputEl = input
    requestAnimationFrame(() => input.focus())
  }

  _removeLabelInput() {
    if (this._labelInputEl) {
      this._labelInputEl.remove()
      this._labelInputEl = null
    }
  }

  // Find the nearest visible series to the cursor Y using actual series data from the event
  _findNearestSeries(param) {
    const pixelY = param.point.y
    const seriesData = param.seriesData
    let best = null
    let bestDist = Infinity

    for (const [id, ov] of this.overlayMap) {
      if (!ov.visible) continue

      const seriesList = []
      if (ov.series) seriesList.push(ov.series)
      if (ov.indicatorSeries) ov.indicatorSeries.forEach(s => seriesList.push(s.series))

      for (const series of seriesList) {
        // Get the actual data value from event's seriesData
        const data = seriesData?.get(series)
        if (!data) continue

        const dataValue = data.close ?? data.value ?? null
        if (dataValue === null || !Number.isFinite(dataValue)) continue

        const dataPixelY = series.priceToCoordinate(dataValue)
        if (dataPixelY === null || !Number.isFinite(dataPixelY)) continue

        const dist = Math.abs(pixelY - dataPixelY)
        if (dist < bestDist) {
          bestDist = dist
          best = { id, ov, series }
        }
      }
    }

    return best
  }

  _findVisibleSeriesForMarkers(overlayId) {
    // Find the specific overlay's series
    const ov = this.overlayMap.get(overlayId)
    if (ov?.visible && ov.series) return ov.series
    if (ov?.visible && ov.indicatorSeries?.length > 0) return ov.indicatorSeries[0].series
    return null
  }

  _renderLabelMarkers() {
    // Detach old primitives
    if (this._labelMarkersPrimitives) {
      for (const entry of this._labelMarkersPrimitives) {
        try { entry.seriesRef.detachPrimitive(entry.primitive) } catch {}
      }
    }
    this._labelMarkersPrimitives = []

    if (this.labels.length === 0) return

    // Group labels by which visible series they should attach to
    const seriesLabelsMap = new Map()

    for (const label of this.labels) {
      if (!label.overlayId) continue
      const targetSeries = this._findVisibleSeriesForMarkers(label.overlayId)
      if (!targetSeries) continue

      if (!seriesLabelsMap.has(targetSeries)) seriesLabelsMap.set(targetSeries, [])
      seriesLabelsMap.get(targetSeries).push(label)
    }

    for (const [series, labels] of seriesLabelsMap) {
      const primitive = new TextLabelsPrimitive(labels)
      series.attachPrimitive(primitive)
      this._labelMarkersPrimitives.push({ primitive, seriesRef: series })
    }
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
    if (this.labels?.length > 0) this._renderLabelMarkers()
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
      // Render label markers now that data is loaded
      this._renderLabelMarkers()
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
