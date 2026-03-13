import type { IChartApi, ISeriesApi, SeriesType } from "lightweight-charts"
import type { Candle } from "../types/candle"
import { TrendLinePrimitive } from "./primitives/trend_line"
import { HLinePrimitive, VLinePrimitive } from "./primitives/guide_lines"
import { TextLabelsPrimitive } from "./primitives/text_labels"
import { findFirstPriceSeries } from "./overlay_utils"
import { DEFAULT_LINE_COLOR, DEFAULT_GUIDE_COLOR, DEFAULT_TREND_WIDTH, DEFAULT_VISIBLE_BARS } from "../config/constants"

export interface LabelMarker {
  id?: string
  time: number
  text: string
  subtext?: string
  color?: string
  position?: "aboveBar" | "belowBar"
  price?: number
  overlayId?: string
  fontSize?: number
  below?: boolean
  stackIndex?: number
}

export interface TrendLineItem {
  id: string
  overlayId: string
  p1: { time: number; price: number }
  p2: { time: number; price: number }
  color?: string
  width?: number
}

export interface HLineItem {
  id: string
  overlayId: string
  price: number
  color?: string
  width?: number
}

export interface VLineItem {
  id: string
  overlayId?: string
  time: number
  color?: string
  width?: number
}

export interface OverlayEntry {
  series?: ISeriesApi<SeriesType> | null
  indicatorSeries?: Array<{ series: ISeriesApi<SeriesType> }> | null
  visible?: boolean
  loader?: { candles?: Candle[] }
  [key: string]: unknown
}

interface PrimitiveAttachment<T> {
  id?: string
  primitive: T
  seriesRef: ISeriesApi<SeriesType>
}

export default class DrawingManager {
  chart: IChartApi
  overlayMap: Map<string, OverlayEntry>
  labels: LabelMarker[]
  conditionLabels: LabelMarker[]
  private _labelMarkersPrimitives: PrimitiveAttachment<InstanceType<typeof TextLabelsPrimitive>>[]
  private _linePrimitives: PrimitiveAttachment<InstanceType<typeof TrendLinePrimitive>>[]
  private _hlinePrimitives: PrimitiveAttachment<InstanceType<typeof HLinePrimitive>>[]
  private _vlinePrimitives: PrimitiveAttachment<InstanceType<typeof VLinePrimitive>>[]
  private _storedLines: TrendLineItem[]
  private _storedHLines: HLineItem[]
  private _storedVLines: VLineItem[]

  constructor(chart: IChartApi, overlayMap: Map<string, OverlayEntry>) {
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

  setLabels(labels: LabelMarker[]): void {
    this.labels = labels || []
    this._renderLabelMarkers()
  }

  setConditionLabels(labels: LabelMarker[]): void {
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
    const candles = firstOv.loader!.candles!
    let idx = candles.findIndex((c: Candle) => c.time >= time)
    if (idx === -1) idx = candles.length - 1
    const range = this.chart.timeScale().getVisibleLogicalRange()
    const visible = range ? range.to - range.from : DEFAULT_VISIBLE_BARS
    const from = Math.max(0, idx - Math.floor(visible / 2))
    this.chart.timeScale().setVisibleLogicalRange({ from, to: from + visible })
  }

  private _renderLabelMarkers(): void {
    this._detachPrimitives(this._labelMarkersPrimitives)
    this._labelMarkersPrimitives = []

    const allLabels = [...(this.labels || []), ...(this.conditionLabels || [])]
    if (allLabels.length === 0) return

    const seriesLabelsMap = new Map<ISeriesApi<SeriesType>, LabelMarker[]>()
    for (const label of allLabels) {
      const targetSeries = label.overlayId
        ? this._findVisibleSeriesForMarkers(label.overlayId)
        : this._findFirstPriceSeries()
      if (!targetSeries) continue
      if (!seriesLabelsMap.has(targetSeries)) seriesLabelsMap.set(targetSeries, [])
      seriesLabelsMap.get(targetSeries)!.push(label)
    }

    for (const [series, labels] of seriesLabelsMap) {
      const inputLabels = labels.map(l => ({ ...l, price: l.price ?? 0 }))
      const primitive = new TextLabelsPrimitive(inputLabels)
      series.attachPrimitive(primitive)
      this._labelMarkersPrimitives.push({ primitive, seriesRef: series })
    }
  }

  // --- Lines ---

  setLines(lines: TrendLineItem[]): void {
    this._storedLines = lines || []
    this._detachPrimitives(this._linePrimitives)
    this._linePrimitives = []
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

  private _attachLinePrimitive(line: TrendLineItem): void {
    const series = this._findVisibleSeriesForMarkers(line.overlayId)
    if (!series) return
    const primitive = new TrendLinePrimitive(line.p1, line.p2, {
      color: line.color || DEFAULT_LINE_COLOR,
      width: line.width || DEFAULT_TREND_WIDTH,
    })
    series.attachPrimitive(primitive)
    this._linePrimitives.push({ id: line.id, primitive, seriesRef: series })
  }

  // --- HLines ---

  setHLines(hlines: HLineItem[]): void {
    this._storedHLines = hlines || []
    this._detachPrimitives(this._hlinePrimitives)
    this._hlinePrimitives = []
    if (!hlines || hlines.length === 0) return
    for (const hl of hlines) {
      this._attachHLinePrimitive(hl)
    }
  }

  private _attachHLinePrimitive(hl: HLineItem): void {
    const series = this._findVisibleSeriesForMarkers(hl.overlayId)
    if (!series) return
    const primitive = new HLinePrimitive(hl.price, {
      color: hl.color || DEFAULT_GUIDE_COLOR,
      width: hl.width || 1,
    })
    series.attachPrimitive(primitive)
    this._hlinePrimitives.push({ id: hl.id, primitive, seriesRef: series })
  }

  // --- VLines ---

  setVLines(vlines: VLineItem[]): void {
    this._storedVLines = vlines || []
    this._detachPrimitives(this._vlinePrimitives)
    this._vlinePrimitives = []
    if (!vlines || vlines.length === 0) return
    for (const vl of vlines) {
      this._attachVLinePrimitive(vl)
    }
  }

  private _attachVLinePrimitive(vl: VLineItem): void {
    const series = (vl.overlayId ? this._findVisibleSeriesForMarkers(vl.overlayId) : null) || this._findFirstPriceSeries()
    if (!series) return
    const primitive = new VLinePrimitive(vl.time, {
      color: vl.color || DEFAULT_GUIDE_COLOR,
      width: vl.width || 1,
    })
    series.attachPrimitive(primitive)
    this._vlinePrimitives.push({ id: vl.id, primitive, seriesRef: series })
  }

  // --- Helpers ---

  private _detachPrimitives(entries: PrimitiveAttachment<unknown>[]): void {
    for (const entry of entries) {
      try { entry.seriesRef.detachPrimitive(entry.primitive as any) } catch { /* already detached */ }
    }
  }

  private _findVisibleSeriesForMarkers(overlayId: string): ISeriesApi<SeriesType> | null {
    const ov = this.overlayMap.get(overlayId)
    if (ov?.visible && ov.series) return ov.series
    if (ov?.visible && ov.indicatorSeries?.length) return ov.indicatorSeries[0].series
    return null
  }

  private _findFirstPriceSeries(): ISeriesApi<SeriesType> | null {
    return findFirstPriceSeries(this.overlayMap) as ISeriesApi<SeriesType> | null
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
    this._detachPrimitives(this._linePrimitives)
    this._detachPrimitives(this._hlinePrimitives)
    this._detachPrimitives(this._vlinePrimitives)
    this._detachPrimitives(this._labelMarkersPrimitives)
    this._linePrimitives = []
    this._hlinePrimitives = []
    this._vlinePrimitives = []
    this._labelMarkersPrimitives = []
  }
}
