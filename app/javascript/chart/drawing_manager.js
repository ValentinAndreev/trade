// Manages all drawing primitives on the chart (labels, lines, hlines, vlines)

import { TrendLinePrimitive } from "./trend_line"
import { HLinePrimitive, VLinePrimitive } from "./guide_lines"
import { TextLabelsPrimitive } from "./text_labels"

export default class DrawingManager {
  constructor(chart, overlayMap) {
    this.chart = chart
    this.overlayMap = overlayMap
    this.labels = []
    this._labelMarkersPrimitives = []
    this._linePrimitives = []
    this._hlinePrimitives = []
    this._vlinePrimitives = []
    this._storedLines = []
    this._storedHLines = []
    this._storedVLines = []
  }

  // --- Labels ---

  setLabels(labels) {
    this.labels = labels || []
    this._renderLabelMarkers()
  }

  refreshLabels() {
    if (this.labels?.length > 0) this._renderLabelMarkers()
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

  _renderLabelMarkers() {
    if (this._labelMarkersPrimitives) {
      for (const entry of this._labelMarkersPrimitives) {
        try { entry.seriesRef.detachPrimitive(entry.primitive) } catch {}
      }
    }
    this._labelMarkersPrimitives = []

    if (this.labels.length === 0) return

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

  // --- Lines ---

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

  // --- HLines ---

  setHLines(hlines) {
    this._storedHLines = hlines || []
    this._detachAllHLinePrimitives()
    if (!hlines || hlines.length === 0) return
    for (const hl of hlines) {
      this._attachHLinePrimitive(hl)
    }
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

  // --- VLines ---

  setVLines(vlines) {
    this._storedVLines = vlines || []
    this._detachAllVLinePrimitives()
    if (!vlines || vlines.length === 0) return
    for (const vl of vlines) {
      this._attachVLinePrimitive(vl)
    }
  }

  _attachVLinePrimitive(vl) {
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

  // --- Helpers ---

  _findVisibleSeriesForMarkers(overlayId) {
    const ov = this.overlayMap.get(overlayId)
    if (ov?.visible && ov.series) return ov.series
    if (ov?.visible && ov.indicatorSeries?.length > 0) return ov.indicatorSeries[0].series
    return null
  }

  _findFirstPriceSeries() {
    for (const [, ov] of this.overlayMap) {
      if (ov.mode !== "indicator" && ov.series && ov.visible) return ov.series
    }
    return null
  }

  // --- Re-render on visibility change ---

  refreshAfterVisibilityChange() {
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

  // --- Cleanup ---

  destroy() {
    this._detachAllLinePrimitives()
    this._detachAllHLinePrimitives()
    this._detachAllVLinePrimitives()
    if (this._labelMarkersPrimitives) {
      for (const entry of this._labelMarkersPrimitives) {
        try { entry.seriesRef.detachPrimitive(entry.primitive) } catch {}
      }
    }
    this._labelMarkersPrimitives = []
  }
}
