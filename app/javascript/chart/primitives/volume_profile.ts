// Volume Profile Series Primitive — draws horizontal volume bars on the left side of the chart
// Uses lightweight-charts ISeriesPrimitive API (v5.x)

import type { IChartApi, ISeriesApi, SeriesType } from "lightweight-charts"
import { withAlpha } from "../../utils/color"
import { VP_BASE_COLOR, VP_DEFAULT_BIN_PX, VP_BAR_WIDTH_RATIO } from "../../config/constants"

type VolumeProfileOptions = { opacity?: number; color?: string; rows?: number }
type VolumeRow = { price: number; volume: number }

class VolumeProfileRenderer {
  _rows: { y: number; height: number; width: number }[] = []
  _color: string = withAlpha(VP_BASE_COLOR, 0.3)

  constructor() {
    this._rows = []    // [{ y, height, width }]
    this._color = withAlpha(VP_BASE_COLOR, 0.3)
  }

  update(rows: { y: number; height: number; width: number }[], color: string): void {
    this._rows = rows
    this._color = color
  }

  draw(target: any): void {
    if (this._rows.length === 0) return

    target.useBitmapCoordinateSpace((scope: any) => {
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
  _source: any
  _renderer: VolumeProfileRenderer
  _rows: { y: number; height: number; width: number }[] = []

  constructor(source: any) {
    this._source = source
    this._renderer = new VolumeProfileRenderer()
    this._rows = []
  }

  update(): void {
    const s = this._source
    if (!s._series || !s._chart) { this._rows = []; return }

    const data = s._data
    if (!data || data.length === 0) { this._rows = []; return }

    const maxVolume = data.reduce((max: number, r: VolumeRow) => Math.max(max, r.volume), 0)
    if (maxVolume === 0) { this._rows = []; return }

    const chartWidth = s._chart.timeScale().width()
    const maxBarWidth = chartWidth * VP_BAR_WIDTH_RATIO

    // Compute pixel height from adjacent bins
    let binPixelHeight = VP_DEFAULT_BIN_PX
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

  renderer(): VolumeProfileRenderer | null {
    if (this._rows.length === 0) return null
    return this._renderer
  }
}

export class VolumeProfilePrimitive {
  _opacity: number
  _baseColor: string
  _numRows: number
  _color: string
  _data: VolumeRow[]
  _chart: IChartApi | null = null
  _series: ISeriesApi<SeriesType> | null = null
  _requestUpdate: (() => void) | null = null
  _paneView: VolumeProfilePaneView

  constructor(options: VolumeProfileOptions = {}) {
    this._opacity = options.opacity ?? 0.3
    this._baseColor = options.color || VP_BASE_COLOR
    this._numRows = options.rows || 50
    this._color = withAlpha(this._baseColor, this._opacity)
    this._data = []    // [{ price, volume }]
    this._chart = null
    this._series = null
    this._requestUpdate = null
    this._paneView = new VolumeProfilePaneView(this)
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

  paneViews(): VolumeProfilePaneView[] {
    return [this._paneView]
  }

  setData(rows: VolumeRow[]): void {
    this._data = rows || []
    if (this._requestUpdate) this._requestUpdate()
  }

  setOpacity(opacity: number): void {
    this._opacity = opacity
    this._color = withAlpha(this._baseColor, this._opacity)
    if (this._requestUpdate) this._requestUpdate()
  }
}
