// Horizontal and Vertical guide line primitives
// Uses lightweight-charts ISeriesPrimitive API (v5.x)

// --- Horizontal Line (full-width at a price level) ---

class HLineRenderer {
  constructor() {
    this._y = null
    this._color = "#2196f3"
    this._width = 1
  }

  update(y, color, width) {
    this._y = y
    this._color = color
    this._width = width
  }

  draw(target) {
    if (this._y === null) return
    target.useBitmapCoordinateSpace((scope) => {
      const ctx = scope.context
      const r = scope.horizontalPixelRatio
      const vr = scope.verticalPixelRatio
      const canvasWidth = scope.bitmapSize.width

      ctx.beginPath()
      ctx.moveTo(0, this._y * vr)
      ctx.lineTo(canvasWidth, this._y * vr)
      ctx.strokeStyle = this._color
      ctx.lineWidth = this._width * r
      ctx.stroke()
    })
  }
}

class HLinePaneView {
  constructor(source) {
    this._source = source
    this._renderer = new HLineRenderer()
    this._y = null
  }

  update() {
    const s = this._source
    if (!s._series || !s._chart) { this._y = null; return }
    const y = s._series.priceToCoordinate(s._price)
    if (y === null) { this._y = null; return }
    this._y = y
    this._renderer.update(y, s._color, s._width)
  }

  renderer() {
    if (this._y === null) return null
    return this._renderer
  }
}

export class HLinePrimitive {
  constructor(price, options = {}) {
    this._price = price
    this._color = options.color || "#2196f3"
    this._width = options.width || 1
    this._chart = null
    this._series = null
    this._requestUpdate = null
    this._paneView = new HLinePaneView(this)
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

// --- Vertical Line (full-height at a time) ---

class VLineRenderer {
  constructor() {
    this._x = null
    this._color = "#2196f3"
    this._width = 1
  }

  update(x, color, width) {
    this._x = x
    this._color = color
    this._width = width
  }

  draw(target) {
    if (this._x === null) return
    target.useBitmapCoordinateSpace((scope) => {
      const ctx = scope.context
      const r = scope.horizontalPixelRatio
      const canvasHeight = scope.bitmapSize.height

      ctx.beginPath()
      ctx.moveTo(this._x * r, 0)
      ctx.lineTo(this._x * r, canvasHeight)
      ctx.strokeStyle = this._color
      ctx.lineWidth = this._width * r
      ctx.stroke()
    })
  }
}

class VLinePaneView {
  constructor(source) {
    this._source = source
    this._renderer = new VLineRenderer()
    this._x = null
  }

  update() {
    const s = this._source
    if (!s._series || !s._chart) { this._x = null; return }
    const x = s._chart.timeScale().timeToCoordinate(s._time)
    if (x === null) { this._x = null; return }
    this._x = x
    this._renderer.update(x, s._color, s._width)
  }

  renderer() {
    if (this._x === null) return null
    return this._renderer
  }
}

export class VLinePrimitive {
  constructor(time, options = {}) {
    this._time = time
    this._color = options.color || "#2196f3"
    this._width = options.width || 1
    this._chart = null
    this._series = null
    this._requestUpdate = null
    this._paneView = new VLinePaneView(this)
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
