import { TrendLinePrimitive } from "./primitives/trend_line"
import {
  DEFAULT_LINE_COLOR, DEFAULT_GUIDE_COLOR, DEFAULT_LABEL_COLOR,
  DEFAULT_TREND_WIDTH, TREND_PREVIEW_DASH, LABEL_BLUR_DELAY_MS,
} from "../config/constants"

export default class InteractionHandler {
  constructor(chart, overlayMap, element) {
    this.chart = chart
    this.overlayMap = overlayMap
    this.element = element
    this.labelMode = false
    this.lineMode = false
    this.hlMode = false
    this.vlMode = false
    this._lineDrawState = null
    this._linePreviewPrimitive = null
    this._linePreviewSeriesRef = null
    this._labelInputEl = null
    this._labelTooltipEl = null
    this._clickHandler = null
    this._crosshairHandler = null
  }

  // --- Mode enter/exit ---

  enterLabelMode() {
    this.labelMode = true
    this._ensureChartSubscriptions()
    this.element.style.cursor = "crosshair"
  }

  exitLabelMode() {
    this.labelMode = false
    this._removeLabelInput()
    this._removeLabelTooltip()
    this._cleanupCrosshairIfNeeded()
    this.element.style.cursor = this._anyInteractiveMode() ? "crosshair" : ""
  }

  enterLineMode() {
    this.lineMode = true
    this._ensureChartSubscriptions()
    this.element.style.cursor = "crosshair"
  }

  exitLineMode() {
    this.lineMode = false
    this._lineDrawState = null
    this._removeLabelTooltip()
    this._removeLinePreview()
    this._cleanupCrosshairIfNeeded()
    this.element.style.cursor = this._anyInteractiveMode() ? "crosshair" : ""
  }

  enterHLineMode() {
    this.hlMode = true
    this._ensureChartSubscriptions()
    this.element.style.cursor = "crosshair"
  }

  exitHLineMode() {
    this.hlMode = false
    this._removeLabelTooltip()
    this._cleanupCrosshairIfNeeded()
    this.element.style.cursor = this._anyInteractiveMode() ? "crosshair" : ""
  }

  enterVLineMode() {
    this.vlMode = true
    this._ensureChartSubscriptions()
    this.element.style.cursor = "crosshair"
  }

  exitVLineMode() {
    this.vlMode = false
    this._removeLabelTooltip()
    this._cleanupCrosshairIfNeeded()
    this.element.style.cursor = this._anyInteractiveMode() ? "crosshair" : ""
  }

  // --- Subscriptions ---

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

  _cleanupCrosshairIfNeeded() {
    if (!this._anyInteractiveMode()) {
      if (this._crosshairHandler) {
        this.chart?.unsubscribeCrosshairMove(this._crosshairHandler)
        this._crosshairHandler = null
      }
    }
  }

  // --- Event handlers ---

  _onChartClick(param) {
    if (this.lineMode) { this._onLineClick(param); return }
    if (this.hlMode) { this._onHLineClick(param); return }
    if (this.vlMode) { this._onVLineClick(param); return }
    if (!this.labelMode) return
    if (!param.point || !param.time) return

    const target = this._findNearestSeries(param)
    if (!target) return
    const price = target.series.coordinateToPrice(param.point.y)
    if (price === null || !Number.isFinite(price)) return

    this._removeLabelTooltip()
    const modeDetail = this._overlayModeStr(target.ov)
    this._showLabelInput(param.point.x, param.point.y, param.time, price, target.id, target.ov.symbol || "", target.ov.mode || "price", modeDetail)
  }

  _onCrosshairMove(param) {
    const anyMode = this._anyInteractiveMode()
    if (!anyMode || !param.point) { this._removeLabelTooltip(); return }
    if (this._labelInputEl) return
    if (!param.time) { this._removeLabelTooltip(); return }

    const target = this._findNearestSeries(param)
    if (!target) { this._removeLabelTooltip(); return }

    const text = `${target.ov.symbol || "?"} ${this._overlayModeStr(target.ov)}`
    this._showLabelTooltip(param.point.x, param.point.y, text)

    if (this.lineMode && this._lineDrawState?.step === "second") {
      const lockedSeries = this._lineDrawState.series
      const price = lockedSeries.coordinateToPrice(param.point.y)
      if (price !== null && Number.isFinite(price)) {
        this._showLinePreview(this._lineDrawState.p1, { time: param.time, price }, lockedSeries)
      }
    }
  }

  _onLineClick(param) {
    if (!param.point || !param.time) return
    const target = this._findNearestSeries(param)
    if (!target) return
    const price = target.series.coordinateToPrice(param.point.y)
    if (price === null || !Number.isFinite(price)) return
    const modeDetail = this._overlayModeStr(target.ov)

    if (!this._lineDrawState) {
      this._lineDrawState = {
        step: "second", p1: { time: param.time, price },
        overlayId: target.id, symbol: target.ov.symbol || "",
        mode: target.ov.mode || "price", modeDetail, series: target.series,
      }
      this._removeLabelTooltip()
      return
    }

    const state = this._lineDrawState
    const p2Price = state.series.coordinateToPrice(param.point.y)
    if (p2Price === null || !Number.isFinite(p2Price)) return
    const p2 = { time: param.time, price: p2Price }

    this._removeLinePreview()
    this._lineDrawState = null
    this._removeLabelTooltip()

    this.element.dispatchEvent(new CustomEvent("line:created", {
      detail: { p1: state.p1, p2, color: DEFAULT_LINE_COLOR, width: DEFAULT_TREND_WIDTH, overlayId: state.overlayId, symbol: state.symbol, mode: state.mode, modeDetail: state.modeDetail },
      bubbles: true,
    }))
  }

  _onHLineClick(param) {
    if (!param.point || !param.time) return
    const target = this._findNearestSeries(param)
    if (!target) return
    const price = target.series.coordinateToPrice(param.point.y)
    if (price === null || !Number.isFinite(price)) return
    this._removeLabelTooltip()
    this.element.dispatchEvent(new CustomEvent("hline:created", {
      detail: { price, color: DEFAULT_GUIDE_COLOR, width: 1, overlayId: target.id, symbol: target.ov.symbol || "", mode: target.ov.mode || "price", modeDetail: this._overlayModeStr(target.ov) },
      bubbles: true,
    }))
  }

  _onVLineClick(param) {
    if (!param.point || !param.time) return
    const target = this._findNearestSeries(param)
    if (!target) return
    this._removeLabelTooltip()
    this.element.dispatchEvent(new CustomEvent("vline:created", {
      detail: { time: param.time, color: DEFAULT_GUIDE_COLOR, width: 1, overlayId: target.id, symbol: target.ov.symbol || "", mode: target.ov.mode || "price", modeDetail: this._overlayModeStr(target.ov) },
      bubbles: true,
    }))
  }

  // --- Line preview ---

  _showLinePreview(p1, currentPoint, series) {
    if (!this._linePreviewPrimitive) {
      this._linePreviewPrimitive = new TrendLinePrimitive(p1, currentPoint, { color: DEFAULT_LINE_COLOR, width: DEFAULT_TREND_WIDTH, dash: TREND_PREVIEW_DASH })
      series.attachPrimitive(this._linePreviewPrimitive)
      this._linePreviewSeriesRef = series
    } else {
      this._linePreviewPrimitive.updatePoints(p1, currentPoint)
    }
  }

  _removeLinePreview() {
    if (this._linePreviewPrimitive && this._linePreviewSeriesRef) {
      try { this._linePreviewSeriesRef.detachPrimitive(this._linePreviewPrimitive) } catch (e) { console.warn("[interaction] detach:", e) }
    }
    this._linePreviewPrimitive = null
    this._linePreviewSeriesRef = null
  }

  // --- Tooltip/Input ---

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
    if (this._labelTooltipEl) { this._labelTooltipEl.remove(); this._labelTooltipEl = null }
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
          this.element.dispatchEvent(new CustomEvent("label:created", {
            detail: { text, time, price, color: DEFAULT_LABEL_COLOR, overlayId, symbol, mode, modeDetail },
            bubbles: true,
          }))
        }
        this._removeLabelInput()
      } else if (e.key === "Escape") {
        this._removeLabelInput()
      }
    })
    input.addEventListener("blur", () => { setTimeout(() => this._removeLabelInput(), LABEL_BLUR_DELAY_MS) })
    this.element.appendChild(input)
    this._labelInputEl = input
    requestAnimationFrame(() => input.focus())
  }

  _removeLabelInput() {
    if (this._labelInputEl) { this._labelInputEl.remove(); this._labelInputEl = null }
  }

  // --- Helpers ---

  _findNearestSeries(param) {
    const pixelY = param.point.y
    const seriesData = param.seriesData
    let best = null, bestDist = Infinity

    for (const [id, ov] of this.overlayMap) {
      if (!ov.visible) continue
      const seriesList = []
      if (ov.series) seriesList.push(ov.series)
      if (ov.indicatorSeries) ov.indicatorSeries.forEach(s => seriesList.push(s.series))

      for (const series of seriesList) {
        const data = seriesData?.get(series)
        if (!data) continue
        const dataValue = data.close ?? data.value ?? null
        if (dataValue === null || !Number.isFinite(dataValue)) continue
        const dataPixelY = series.priceToCoordinate(dataValue)
        if (dataPixelY === null || !Number.isFinite(dataPixelY)) continue
        const dist = Math.abs(pixelY - dataPixelY)
        if (dist < bestDist) { bestDist = dist; best = { id, ov, series } }
      }
    }
    return best
  }

  _anyInteractiveMode() {
    return this.labelMode || this.lineMode || this.hlMode || this.vlMode
  }

  _overlayModeStr(ov) {
    if (ov.mode === "indicator") return (ov.indicatorType || "ind").toUpperCase()
    return ov.mode === "volume" ? "Vol" : "Price"
  }

  // --- Cleanup ---

  destroy() {
    if (this._clickHandler) this.chart?.unsubscribeClick(this._clickHandler)
    if (this._crosshairHandler) this.chart?.unsubscribeCrosshairMove(this._crosshairHandler)
    this._removeLabelInput()
    this._removeLabelTooltip()
    this._removeLinePreview()
  }
}
