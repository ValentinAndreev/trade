import type { IChartApi, ISeriesApi, SeriesType } from "lightweight-charts"
import {
  DEFAULT_LABEL_COLOR, LABEL_FONT_SIZES,
  LABEL_MARKER_RADIUS, LABEL_TEXT_OFFSET,
} from "../../config/constants"

type LabelPoint = { x: number; y: number; text: string; color: string; fontSize: number }
type InputLabel = { time: number; price: number; text: string; color?: string; fontSize?: number }

class TextLabelsRenderer {
  _labels: LabelPoint[] = []

  constructor() {
    this._labels = []
  }

  update(labels: LabelPoint[]): void {
    this._labels = labels
  }

  draw(target: any): void {
    if (this._labels.length === 0) return

    target.useBitmapCoordinateSpace((scope: any) => {
      const ctx = scope.context
      const r = scope.horizontalPixelRatio
      const vr = scope.verticalPixelRatio

      for (const label of this._labels) {
        const x = label.x * r
        const y = label.y * vr
        const fontSize = label.fontSize * vr

        // Small circle marker
        ctx.beginPath()
        ctx.arc(x, y, LABEL_MARKER_RADIUS * r, 0, 2 * Math.PI)
        ctx.fillStyle = label.color
        ctx.fill()

        // Text above marker
        ctx.font = `${Math.round(fontSize)}px sans-serif`
        ctx.fillStyle = label.color
        ctx.textAlign = "center"
        ctx.textBaseline = "bottom"
        ctx.fillText(label.text, x, y - LABEL_TEXT_OFFSET * vr)
      }
    })
  }
}

class TextLabelsPaneView {
  _source: any
  _renderer: TextLabelsRenderer
  _labels: LabelPoint[] = []

  constructor(source: any) {
    this._source = source
    this._renderer = new TextLabelsRenderer()
    this._labels = []
  }

  update(): void {
    const s = this._source
    if (!s._series || !s._chart) { this._labels = []; return }

    const timeScale = s._chart.timeScale()
    const series = s._series

    const labels: LabelPoint[] = []
    for (const label of s._labels) {
      const x = timeScale.timeToCoordinate(label.time)
      const y = series.priceToCoordinate(label.price)
      if (x === null || y === null) continue
      labels.push({
        x, y,
        text: label.text,
        color: label.color || DEFAULT_LABEL_COLOR,
        fontSize: LABEL_FONT_SIZES[label.fontSize || 1] || 10,
      })
    }

    this._labels = labels
    this._renderer.update(labels)
  }

  renderer(): TextLabelsRenderer | null {
    if (this._labels.length === 0) return null
    return this._renderer
  }
}

export class TextLabelsPrimitive {
  _labels: InputLabel[]
  _chart: IChartApi | null = null
  _series: ISeriesApi<SeriesType> | null = null
  _requestUpdate: (() => void) | null = null
  _paneView: TextLabelsPaneView

  constructor(labels?: InputLabel[]) {
    this._labels = labels || []
    this._chart = null
    this._series = null
    this._requestUpdate = null
    this._paneView = new TextLabelsPaneView(this)
  }

  attached({ chart, series, requestUpdate }: { chart: IChartApi; series: ISeriesApi<SeriesType>; requestUpdate: () => void }): void {
    this._chart = chart
    this._series = series
    this._requestUpdate = requestUpdate
  }

  detached(): void {
    this._chart = null
    this._series = null
    this._requestUpdate = null
  }

  updateAllViews(): void {
    this._paneView.update()
  }

  paneViews(): TextLabelsPaneView[] {
    return [this._paneView]
  }
}
