import type { IChartApi } from "lightweight-charts"
import type { Candle } from "../types/candle"
import { TrendLinePrimitive } from "./primitives/trend_line"
import { HLinePrimitive, VLinePrimitive } from "./primitives/guide_lines"
import { TextLabelsPrimitive } from "./primitives/text_labels"
import { findFirstPriceSeries } from "./overlay_utils"
import { DEFAULT_LINE_COLOR, DEFAULT_GUIDE_COLOR, DEFAULT_TREND_WIDTH, DEFAULT_VISIBLE_BARS } from "../config/constants"

export default class DrawingManager {
  chart: IChartApi
  overlayMap: Map<string, any>
  labels: any[]
  _labelMarkersPrimitives: { primitive: any; seriesRef: any }[]
  _linePrimitives: { id: string; primitive: any; seriesRef: any }[]
  _hlinePrimitives: { id: string; primitive: any; seriesRef: any }[]
  _vlinePrimitives: { id: string; primitive: any; seriesRef: any }[]
  _storedLines: any[]
  _storedHLines: any[]
  _storedVLines: any[]

  conditionLabels: any[]

  constructor(chart: IChartApi, overlayMap: Map<string, any>) {
    this.chart = chart
    this.overlayMap = overlayMap
    this.labels = []
    this.conditionLabels = []
    this._labelMarkersPrimitives = []
    this._linePrimitives = []
    this._hlinePrimitives = []
    this._vlinePrimitives = []
    this._storedLines = []
    this._storedHLines = []
    this._storedVLines = []
  }

  // --- Labels ---

  setLabels(labels: any[]): void {
    this.labels = labels || []
    this._renderLabelMarkers()
  }

  setConditionLabels(labels: any[]): void {
    this.conditionLabels = labels || []
    this._renderLabelMarkers()
  }

  refreshLabels(): void {
    if (this.labels?.length > 0 || this.conditionLabels?.length > 0) this._renderLabelMarkers()
  }

  scrollToLabel(time: number): void {
    if (!this.chart) return
    const firstOv = [...this.overlayMap.values()].find(ov => ov.loader?.candles?.length)
    if (!firstOv) return
    const candles = firstOv.loader.candles
    let idx = candles.findIndex((c: Candle) => c.time >= time)
    if (idx === -1) idx = candles.length - 1
    const range = this.chart.timeScale().getVisibleLogicalRange()
    const visible = range ? range.to - range.from : DEFAULT_VISIBLE_BARS
    const from = Math.max(0, idx - Math.floor(visible / 2))
    this.chart.timeScale().setVisibleLogicalRange({ from, to: from + visible })
  }

  _renderLabelMarkers(): void {
    if (this._labelMarkersPrimitives) {
      for (const entry of this._labelMarkersPrimitives) {
        try { entry.seriesRef.detachPrimitive(entry.primitive) } catch (e) { console.warn("[drawing] detach:", e) }
      }
    }
    this._labelMarkersPrimitives = []

    const allLabels = [...(this.labels || []), ...(this.conditionLabels || [])]
    if (allLabels.length === 0) return

    const seriesLabelsMap = new Map()
    for (const label of allLabels) {
      const targetSeries = label.overlayId
        ? this._findVisibleSeriesForMarkers(label.overlayId)
        : this._findFirstPriceSeries()
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

  // --- Lines ---

  setLines(lines: any[]): void {
    this._storedLines = lines || []
    this._detachAllLinePrimitives()
    if (!lines || lines.length === 0) return
    for (const line of lines) {
      this._attachLinePrimitive(line)
    }
  }

  scrollToLine(time: number | { time?: number }): void {
    if (!this.chart) return
    const t = typeof time === "number" ? time : (time?.time || 0)
    this.scrollToLabel(t)
  }

  _attachLinePrimitive(line: any): void {
    const series = this._findVisibleSeriesForMarkers(line.overlayId)
    if (!series) return
    const primitive = new TrendLinePrimitive(line.p1, line.p2, {
      color: line.color || DEFAULT_LINE_COLOR,
      width: line.width || DEFAULT_TREND_WIDTH,
    })
    series.attachPrimitive(primitive)
    this._linePrimitives.push({ id: line.id, primitive, seriesRef: series })
  }

  _detachAllLinePrimitives(): void {
    for (const entry of this._linePrimitives) {
      try { entry.seriesRef.detachPrimitive(entry.primitive) } catch (e) { console.warn("[drawing] detach:", e) }
    }
    this._linePrimitives = []
  }

  // --- HLines ---

  setHLines(hlines: any[]): void {
    this._storedHLines = hlines || []
    this._detachAllHLinePrimitives()
    if (!hlines || hlines.length === 0) return
    for (const hl of hlines) {
      this._attachHLinePrimitive(hl)
    }
  }

  _attachHLinePrimitive(hl: any): void {
    const series = this._findVisibleSeriesForMarkers(hl.overlayId)
    if (!series) return
    const primitive = new HLinePrimitive(hl.price, {
      color: hl.color || DEFAULT_GUIDE_COLOR,
      width: hl.width || 1,
    })
    series.attachPrimitive(primitive)
    this._hlinePrimitives.push({ id: hl.id, primitive, seriesRef: series })
  }

  _detachAllHLinePrimitives(): void {
    for (const entry of this._hlinePrimitives) {
      try { entry.seriesRef.detachPrimitive(entry.primitive) } catch (e) { console.warn("[drawing] detach:", e) }
    }
    this._hlinePrimitives = []
  }

  // --- VLines ---

  setVLines(vlines: any[]): void {
    this._storedVLines = vlines || []
    this._detachAllVLinePrimitives()
    if (!vlines || vlines.length === 0) return
    for (const vl of vlines) {
      this._attachVLinePrimitive(vl)
    }
  }

  _attachVLinePrimitive(vl: any): void {
    const series = this._findVisibleSeriesForMarkers(vl.overlayId) || this._findFirstPriceSeries()
    if (!series) return
    const primitive = new VLinePrimitive(vl.time, {
      color: vl.color || DEFAULT_GUIDE_COLOR,
      width: vl.width || 1,
    })
    series.attachPrimitive(primitive)
    this._vlinePrimitives.push({ id: vl.id, primitive, seriesRef: series })
  }

  _detachAllVLinePrimitives(): void {
    for (const entry of this._vlinePrimitives) {
      try { entry.seriesRef.detachPrimitive(entry.primitive) } catch (e) { console.warn("[drawing] detach:", e) }
    }
    this._vlinePrimitives = []
  }

  // --- Helpers ---

  _findVisibleSeriesForMarkers(overlayId: string): any {
    const ov = this.overlayMap.get(overlayId)
    if (ov?.visible && ov.series) return ov.series
    if (ov?.visible && ov.indicatorSeries?.length > 0) return ov.indicatorSeries[0].series
    return null
  }

  _findFirstPriceSeries(): any {
    return findFirstPriceSeries(this.overlayMap)
  }

  // --- Re-render on visibility change ---

  refreshAfterVisibilityChange(): void {
    if (this.labels?.length > 0 || this.conditionLabels?.length > 0) this._renderLabelMarkers()
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

  // --- Cleanup ---

  destroy(): void {
    this._detachAllLinePrimitives()
    this._detachAllHLinePrimitives()
    this._detachAllVLinePrimitives()
    if (this._labelMarkersPrimitives) {
      for (const entry of this._labelMarkersPrimitives) {
        try { entry.seriesRef.detachPrimitive(entry.primitive) } catch (e) { console.warn("[drawing] detach:", e) }
      }
    }
    this._labelMarkersPrimitives = []
  }
}
