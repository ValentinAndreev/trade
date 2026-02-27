// Volume Profile Series Primitive — draws horizontal volume bars on the left side of the chart
// Uses lightweight-charts ISeriesPrimitive API (v5.x)

class VolumeProfileRenderer {
  constructor() {
    this._rows = []    // [{ y, height, width }]
    this._color = "rgba(41, 98, 255, 0.3)"
  }

  update(rows, color) {
    this._rows = rows
    this._color = color
  }

  draw(target) {
    if (this._rows.length === 0) return

    target.useBitmapCoordinateSpace((scope) => {
      const ctx = scope.context
      const r = scope.horizontalPixelRatio
      const vr = scope.verticalPixelRatio

      ctx.fillStyle = this._color
      for (const row of this._rows) {
        ctx.fillRect(0, row.y * vr, row.width * r, row.height * vr)
      }
    })
  }
}

class VolumeProfilePaneView {
  constructor(source) {
    this._source = source
    this._renderer = new VolumeProfileRenderer()
    this._rows = []
  }

  update() {
    const s = this._source
    if (!s._series || !s._chart) { this._rows = []; return }

    const data = s._data
    if (!data || data.length === 0) { this._rows = []; return }

    const maxVolume = data.reduce((max, r) => Math.max(max, r.volume), 0)
    if (maxVolume === 0) { this._rows = []; return }

    const chartWidth = s._chart.timeScale().width()
    const maxBarWidth = chartWidth * 0.25

    // Compute pixel height from adjacent bins
    let binPixelHeight = 4
    if (data.length >= 2) {
      const y0 = s._series.priceToCoordinate(data[0].price)
      const y1 = s._series.priceToCoordinate(data[1].price)
      if (y0 !== null && y1 !== null) {
        binPixelHeight = Math.max(1, Math.abs(y1 - y0))
      }
    }

    const rows = []
    for (const row of data) {
      const y = s._series.priceToCoordinate(row.price)
      if (y === null) continue
      const width = (row.volume / maxVolume) * maxBarWidth
      rows.push({ y: y - binPixelHeight / 2, height: binPixelHeight, width })
    }

    this._rows = rows
    this._renderer.update(rows, s._color)
  }

  renderer() {
    if (this._rows.length === 0) return null
    return this._renderer
  }
}

export class VolumeProfilePrimitive {
  constructor(options = {}) {
    this._opacity = options.opacity ?? 0.3
    this._baseColor = options.color || "#2962FF"
    this._numRows = options.rows || 50
    this._color = this._computeColor()
    this._data = []    // [{ price, volume }]
    this._chart = null
    this._series = null
    this._requestUpdate = null
    this._paneView = new VolumeProfilePaneView(this)
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

  updateAllViews() {
    this._paneView.update()
  }

  paneViews() {
    return [this._paneView]
  }

  setData(rows) {
    this._data = rows || []
    if (this._requestUpdate) this._requestUpdate()
  }

  setOpacity(opacity) {
    this._opacity = opacity
    this._color = this._computeColor()
    if (this._requestUpdate) this._requestUpdate()
  }

  _computeColor() {
    // Parse hex color and apply opacity
    const hex = this._baseColor.replace("#", "")
    const r = parseInt(hex.substring(0, 2), 16)
    const g = parseInt(hex.substring(2, 4), 16)
    const b = parseInt(hex.substring(4, 6), 16)
    return `rgba(${r}, ${g}, ${b}, ${this._opacity})`
  }
}
