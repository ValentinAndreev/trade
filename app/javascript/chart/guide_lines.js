// Horizontal and Vertical guide line primitives
// Uses lightweight-charts ISeriesPrimitive API (v5.x)

function createLineRenderer(drawLine) {
  return class {
    constructor() {
      this._coord = null
      this._color = "#2196f3"
      this._width = 1
    }

    update(coord, color, width) {
      this._coord = coord
      this._color = color
      this._width = width
    }

    draw(target) {
      if (this._coord === null) return
      target.useBitmapCoordinateSpace((scope) => {
        const ctx = scope.context
        ctx.beginPath()
        drawLine(ctx, this._coord, scope)
        ctx.strokeStyle = this._color
        ctx.lineWidth = this._width * scope.horizontalPixelRatio
        ctx.stroke()
      })
    }
  }
}

function createLinePrimitive({ valueKey, getCoord, drawLine }) {
  const Renderer = createLineRenderer(drawLine)

  class PaneView {
    constructor(source) {
      this._source = source
      this._renderer = new Renderer()
      this._coord = null
    }

    update() {
      const s = this._source
      if (!s._series || !s._chart) { this._coord = null; return }
      const coord = getCoord(s)
      if (coord === null) { this._coord = null; return }
      this._coord = coord
      this._renderer.update(coord, s._color, s._width)
    }

    renderer() {
      return this._coord === null ? null : this._renderer
    }
  }

  return class {
    constructor(value, options = {}) {
      this[valueKey] = value
      this._color = options.color || "#2196f3"
      this._width = options.width || 1
      this._chart = null
      this._series = null
      this._requestUpdate = null
      this._paneView = new PaneView(this)
    }

    attached({ chart, series, requestUpdate }) {
      this._chart = chart
      this._series = series
      this._requestUpdate = requestUpdate
    }

    detached() {
      this._chart = null
      this._series = null
      this._requestUpdate = null
    }

    updateAllViews() { this._paneView.update() }
    paneViews() { return [this._paneView] }

    requestUpdate() { if (this._requestUpdate) this._requestUpdate() }

    updateOptions(options) {
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
