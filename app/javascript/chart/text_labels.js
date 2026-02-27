// TextLabels Series Primitive — draws text labels with configurable font size and color
// Uses lightweight-charts ISeriesPrimitive API (v5.x)

const FONT_SIZES = [0, 10, 13, 16, 20, 24] // index 1–5

class TextLabelsRenderer {
  constructor() {
    this._labels = []
  }

  update(labels) {
    this._labels = labels
  }

  draw(target) {
    if (this._labels.length === 0) return

    target.useBitmapCoordinateSpace((scope) => {
      const ctx = scope.context
      const r = scope.horizontalPixelRatio
      const vr = scope.verticalPixelRatio

      for (const label of this._labels) {
        const x = label.x * r
        const y = label.y * vr
        const fontSize = label.fontSize * vr

        // Small circle marker
        ctx.beginPath()
        ctx.arc(x, y, 3 * r, 0, 2 * Math.PI)
        ctx.fillStyle = label.color
        ctx.fill()

        // Text above marker
        ctx.font = `${Math.round(fontSize)}px sans-serif`
        ctx.fillStyle = label.color
        ctx.textAlign = "center"
        ctx.textBaseline = "bottom"
        ctx.fillText(label.text, x, y - 6 * vr)
      }
    })
  }
}

class TextLabelsPaneView {
  constructor(source) {
    this._source = source
    this._renderer = new TextLabelsRenderer()
    this._labels = []
  }

  update() {
    const s = this._source
    if (!s._series || !s._chart) { this._labels = []; return }

    const timeScale = s._chart.timeScale()
    const series = s._series

    const labels = []
    for (const label of s._labels) {
      const x = timeScale.timeToCoordinate(label.time)
      const y = series.priceToCoordinate(label.price)
      if (x === null || y === null) continue
      labels.push({
        x, y,
        text: label.text,
        color: label.color || "#ffffff",
        fontSize: FONT_SIZES[label.fontSize || 1] || 10,
      })
    }

    this._labels = labels
    this._renderer.update(labels)
  }

  renderer() {
    if (this._labels.length === 0) return null
    return this._renderer
  }
}

export class TextLabelsPrimitive {
  constructor(labels) {
    this._labels = labels || []
    this._chart = null
    this._series = null
    this._requestUpdate = null
    this._paneView = new TextLabelsPaneView(this)
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
}
