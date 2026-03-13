import type { IChartApi, ISeriesApi, SeriesType } from "lightweight-charts"
import type { CanvasRenderingTarget2D, BitmapCoordinatesRenderingScope } from "fancy-canvas"
import {
  DEFAULT_LABEL_COLOR, LABEL_FONT_SIZES,
  LABEL_MARKER_RADIUS, LABEL_TEXT_OFFSET,
  TEXT_LABEL_BASE_PX, TEXT_LABEL_STACK_PX,
} from "../../config/constants"

type LabelPoint = {
  x: number; y: number; text: string; subtext?: string
  color: string; fontSize: number
  /** true = circle is below the bar → text goes further down */
  below: boolean
}
type InputLabel = {
  time: number
  price: number
  text: string
  subtext?: string
  color?: string
  fontSize?: number
  /** true = place BELOW the price (long entry / short exit), false = place ABOVE */
  below?: boolean
  /** index for stacking multiple markers at the same bar+side */
  stackIndex?: number
}

class TextLabelsRenderer {
  _labels: LabelPoint[] = []

  constructor() {
    this._labels = []
  }

  update(labels: LabelPoint[]): void {
    this._labels = labels
  }

  draw(target: CanvasRenderingTarget2D): void {
    if (this._labels.length === 0) return

    target.useBitmapCoordinateSpace((scope: BitmapCoordinatesRenderingScope) => {
      const ctx = scope.context
      const r = scope.horizontalPixelRatio
      const vr = scope.verticalPixelRatio

      for (const label of this._labels) {
        const x = label.x * r
        const y = label.y * vr
        const fontSize = label.fontSize * vr
        const radius = LABEL_MARKER_RADIUS * r
        const offset = LABEL_TEXT_OFFSET * vr
        const dir = label.below ? 1 : -1   // +1 → downward (below bar), -1 → upward (above bar)

        // Small circle marker
        ctx.beginPath()
        ctx.arc(x, y, radius, 0, 2 * Math.PI)
        ctx.fillStyle = label.color
        ctx.fill()

        // Main text — away from the bar (same direction as dir)
        ctx.font = `${Math.round(fontSize)}px sans-serif`
        ctx.fillStyle = label.color
        ctx.textAlign = "center"
        if (label.below) {
          ctx.textBaseline = "top"
          ctx.fillText(label.text, x, y + radius + offset)
        } else {
          ctx.textBaseline = "bottom"
          ctx.fillText(label.text, x, y - radius - offset)
        }

        // System name — even further from the bar, smaller + dimmed
        if (label.subtext) {
          const subtextSize = Math.max(8 * vr, Math.round(fontSize * 0.65))
          ctx.font = `${subtextSize}px sans-serif`
          ctx.fillStyle = label.color
          ctx.globalAlpha = 0.6
          const textLineH = fontSize + offset
          if (label.below) {
            ctx.textBaseline = "top"
            ctx.fillText(label.subtext, x, y + radius + offset + textLineH)
          } else {
            ctx.textBaseline = "bottom"
            ctx.fillText(label.subtext, x, y - radius - offset - textLineH)
          }
          ctx.globalAlpha = 1
        }
      }
    })
  }
}

class TextLabelsPaneView {
  _source: TextLabelsPrimitive
  _renderer: TextLabelsRenderer
  _labels: LabelPoint[] = []

  constructor(source: TextLabelsPrimitive) {
    this._source = source
    this._renderer = new TextLabelsRenderer()
    this._labels = []
  }

  update(): void {
    const s = this._source
    if (!s._series || !s._chart) { this._labels = []; return }

    const timeScale = s._chart.timeScale()
    const series = s._series

    // TEXT_LABEL_BASE_PX: gap between wick tip and circle centre.
    // TEXT_LABEL_STACK_PX: pixels between consecutive stacked markers (circle + text + subtext + gap).

    const labels: LabelPoint[] = []
    for (const label of s._labels) {
      const x = timeScale.timeToCoordinate(label.time as import("lightweight-charts").Time)
      const anchorY = series.priceToCoordinate(label.price)
      if (x === null || anchorY === null) continue

      const stack = label.stackIndex ?? 0
      const below = label.below ?? false
      const pixelOffset = TEXT_LABEL_BASE_PX + stack * TEXT_LABEL_STACK_PX
      // below=true → canvas y increases → add offset; above bar → subtract
      const y = below ? anchorY + pixelOffset : anchorY - pixelOffset

      labels.push({
        x, y,
        text: label.text,
        subtext: label.subtext,
        color: label.color || DEFAULT_LABEL_COLOR,
        fontSize: LABEL_FONT_SIZES[label.fontSize || 1] || 10,
        below,
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
