import type { IChartApi, ISeriesApi, SeriesType } from "lightweight-charts"
import { DEFAULT_LINE_COLOR, DEFAULT_TREND_WIDTH, ENDPOINT_RADIUS } from "../../config/constants"

type TimePricePoint = { time: number; price: number }
type TrendLineOptions = { color?: string; width?: number; dash?: number[] }

class TrendLineRenderer {
  _p1: { x: number; y: number } | null = null
  _p2: { x: number; y: number } | null = null
  _color: string = DEFAULT_LINE_COLOR
  _width: number = DEFAULT_TREND_WIDTH
  _dash: number[] | null = null

  constructor() {
    this._p1 = null
    this._p2 = null
    this._color = DEFAULT_LINE_COLOR
    this._width = DEFAULT_TREND_WIDTH
    this._dash = null
  }

  update(p1: { x: number; y: number }, p2: { x: number; y: number }, color: string, width: number, dash: number[] | null): void {
    this._p1 = p1
    this._p2 = p2
    this._color = color
    this._width = width
    this._dash = dash || null
  }

  draw(target: any): void {
    const p1 = this._p1
    const p2 = this._p2
    if (!p1 || !p2) return

    target.useBitmapCoordinateSpace((scope: any) => {
      const ctx = scope.context
      const r = scope.horizontalPixelRatio
      const vr = scope.verticalPixelRatio

      ctx.beginPath()
      ctx.moveTo(p1.x * r, p1.y * vr)
      ctx.lineTo(p2.x * r, p2.y * vr)
      ctx.strokeStyle = this._color
      ctx.lineWidth = this._width * r
      if (this._dash) {
        ctx.setLineDash(this._dash.map(d => d * r))
      } else {
        ctx.setLineDash([])
      }
      ctx.stroke()
      ctx.setLineDash([])

      // Draw small circles at endpoints
      for (const p of [p1, p2]) {
        ctx.beginPath()
        ctx.arc(p.x * r, p.y * vr, ENDPOINT_RADIUS * r, 0, 2 * Math.PI)
        ctx.fillStyle = this._color
        ctx.fill()
      }
    })
  }
}

class TrendLinePaneView {
  _source: any
  _renderer: TrendLineRenderer
  _p1: { x: number; y: number } | null = null
  _p2: { x: number; y: number } | null = null

  constructor(source: any) {
    this._source = source
    this._renderer = new TrendLineRenderer()
    this._p1 = null
    this._p2 = null
  }

  update(): void {
    const s = this._source
    if (!s._series || !s._chart) return

    const timeScale = s._chart.timeScale()
    const series = s._series

    const x1 = timeScale.timeToCoordinate(s._p1.time)
    const y1 = series.priceToCoordinate(s._p1.price)
    const x2 = timeScale.timeToCoordinate(s._p2.time)
    const y2 = series.priceToCoordinate(s._p2.price)

    if (x1 === null || y1 === null || x2 === null || y2 === null) {
      this._p1 = null
      this._p2 = null
      return
    }

    this._p1 = { x: x1, y: y1 }
    this._p2 = { x: x2, y: y2 }

    this._renderer.update(
      this._p1, this._p2,
      s._color, s._width, s._dash,
    )
  }

  renderer(): TrendLineRenderer | null {
    if (!this._p1 || !this._p2) return null
    return this._renderer
  }
}

export class TrendLinePrimitive {
  _p1: TimePricePoint
  _p2: TimePricePoint
  _color: string
  _width: number
  _dash: number[] | null
  _chart: IChartApi | null = null
  _series: ISeriesApi<SeriesType> | null = null
  _requestUpdate: (() => void) | null = null
  _paneView: TrendLinePaneView

  constructor(p1: TimePricePoint, p2: TimePricePoint, options: TrendLineOptions = {}) {
    this._p1 = p1   // { time, price }
    this._p2 = p2   // { time, price }
    this._color = options.color || DEFAULT_LINE_COLOR
    this._width = options.width || DEFAULT_TREND_WIDTH
    this._dash = options.dash || null
    this._chart = null
    this._series = null
    this._requestUpdate = null
    this._paneView = new TrendLinePaneView(this)
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

  paneViews(): TrendLinePaneView[] {
    return [this._paneView]
  }

  requestUpdate(): void {
    if (this._requestUpdate) this._requestUpdate()
  }

  updatePoints(p1: TimePricePoint, p2: TimePricePoint): void {
    this._p1 = p1
    this._p2 = p2
    this.requestUpdate()
  }

  updateOptions(options: TrendLineOptions): void {
    if (options.color !== undefined) this._color = options.color
    if (options.width !== undefined) this._width = options.width
    if (options.dash !== undefined) this._dash = options.dash
    this.requestUpdate()
  }
}
