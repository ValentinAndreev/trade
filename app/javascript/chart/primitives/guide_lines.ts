import type { IChartApi, ISeriesApi, SeriesType } from "lightweight-charts"
import { DEFAULT_LINE_COLOR } from "../../config/constants"

type DrawLineFn = (ctx: CanvasRenderingContext2D, coord: number, scope: any) => void

function createLineRenderer(drawLine: DrawLineFn) {
  return class {
    _coord: number | null = null
    _color: string = DEFAULT_LINE_COLOR
    _width: number = 1

    constructor() {
      this._coord = null
      this._color = DEFAULT_LINE_COLOR
      this._width = 1
    }

    update(coord: number | null, color: string, width: number): void {
      this._coord = coord
      this._color = color
      this._width = width
    }

    draw(target: any): void {
      const coord = this._coord
      if (coord === null) return
      target.useBitmapCoordinateSpace((scope: any) => {
        const ctx = scope.context
        ctx.beginPath()
        drawLine(ctx, coord, scope)
        ctx.strokeStyle = this._color
        ctx.lineWidth = this._width * scope.horizontalPixelRatio
        ctx.stroke()
      })
    }
  }
}

type CreateLinePrimitiveParams = {
  valueKey: string
  getCoord: (source: any) => number | null
  drawLine: DrawLineFn
}

function createLinePrimitive({ valueKey, getCoord, drawLine }: CreateLinePrimitiveParams) {
  const Renderer = createLineRenderer(drawLine)

  class PaneView {
    _source: any
    _renderer: InstanceType<ReturnType<typeof createLineRenderer>>
    _coord: number | null = null

    constructor(source: any) {
      this._source = source
      this._renderer = new Renderer()
      this._coord = null
    }

    update(): void {
      const s = this._source
      if (!s._series || !s._chart) { this._coord = null; return }
      const coord = getCoord(s)
      if (coord === null) { this._coord = null; return }
      this._coord = coord
      this._renderer.update(coord, s._color, s._width)
    }

    renderer(): any {
      return this._coord === null ? null : this._renderer
    }
  }

  return class {
    [key: string]: any
    _chart: IChartApi | null = null
    _series: ISeriesApi<SeriesType> | null = null
    _requestUpdate: (() => void) | null = null
    _paneView: PaneView

    constructor(value: number, options: { color?: string; width?: number } = {}) {
      this[valueKey] = value
      this._color = options.color || DEFAULT_LINE_COLOR
      this._width = options.width || 1
      this._chart = null
      this._series = null
      this._requestUpdate = null
      this._paneView = new PaneView(this)
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

    updateAllViews(): void { this._paneView.update() }
    paneViews(): PaneView[] { return [this._paneView] }

    requestUpdate(): void { if (this._requestUpdate) this._requestUpdate() }

    updateOptions(options: { color?: string; width?: number }): void {
      if (options.color !== undefined) this._color = options.color
      if (options.width !== undefined) this._width = options.width
      this.requestUpdate()
    }
  }
}

export const HLinePrimitive = createLinePrimitive({
  valueKey: "_price",
  getCoord: (source) => source._series.priceToCoordinate(source._price),
  drawLine: (ctx, coord, scope) => {
    const y = coord * scope.verticalPixelRatio
    ctx.moveTo(0, y)
    ctx.lineTo(scope.bitmapSize.width, y)
  },
})

export const VLinePrimitive = createLinePrimitive({
  valueKey: "_time",
  getCoord: (source) => source._chart.timeScale().timeToCoordinate(source._time),
  drawLine: (ctx, coord, scope) => {
    const x = coord * scope.horizontalPixelRatio
    ctx.moveTo(x, 0)
    ctx.lineTo(x, scope.bitmapSize.height)
  },
})
