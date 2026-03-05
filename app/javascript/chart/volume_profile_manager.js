import { VolumeProfilePrimitive } from "./primitives/volume_profile"
import { findFirstPriceSeries } from "./overlay_utils"
import { VP_DEFAULT_OPACITY, VP_DEFAULT_ROWS } from "../config/constants"

export default class VolumeProfileManager {
  constructor(chart, overlayMap) {
    this.chart = chart
    this.overlayMap = overlayMap
    this._vpEnabled = false
    this._vpOpacity = VP_DEFAULT_OPACITY
    this._vpPrimitive = null
    this._vpSeriesRef = null
    this._vpRangeHandler = null
    this._vpRafId = null
  }

  get enabled() { return this._vpEnabled }

  enableVolumeProfile(opacity) {
    if (!this.chart) return
    if (typeof opacity === "number") this._vpOpacity = opacity

    const series = this._findFirstPriceSeries()
    if (!series) return

    this._vpPrimitive = new VolumeProfilePrimitive({ opacity: this._vpOpacity })
    series.attachPrimitive(this._vpPrimitive)
    this._vpSeriesRef = series
    this._vpEnabled = true

    this._vpRangeHandler = () => this._scheduleVpUpdate()
    this.chart.timeScale().subscribeVisibleLogicalRangeChange(this._vpRangeHandler)
    this._updateVolumeProfile()
  }

  disableVolumeProfile() {
    this._detachVolumeProfile()
  }

  setOpacity(opacity) {
    this._vpOpacity = opacity
    if (this._vpPrimitive) this._vpPrimitive.setOpacity(opacity)
  }

  _detachVolumeProfile() {
    if (this._vpRangeHandler && this.chart) {
      this.chart.timeScale().unsubscribeVisibleLogicalRangeChange(this._vpRangeHandler)
    }
    if (this._vpPrimitive && this._vpSeriesRef) {
      try { this._vpSeriesRef.detachPrimitive(this._vpPrimitive) } catch (e) { console.warn("[vp] detach:", e) }
    }
    if (this._vpRafId) cancelAnimationFrame(this._vpRafId)
    this._vpPrimitive = null
    this._vpSeriesRef = null
    this._vpRangeHandler = null
    this._vpRafId = null
    this._vpEnabled = false
  }

  _findFirstPriceSeries() {
    return findFirstPriceSeries(this.overlayMap)
  }

  _scheduleVpUpdate() {
    if (this._vpRafId) return
    this._vpRafId = requestAnimationFrame(() => {
      this._vpRafId = null
      this._updateVolumeProfile()
    })
  }

  _updateVolumeProfile() {
    if (!this._vpPrimitive || !this.chart) return
    const range = this.chart.timeScale().getVisibleLogicalRange()
    if (!range) return
    const from = Math.max(0, Math.floor(range.from))
    const to = Math.ceil(range.to)

    let candles = null
    for (const [, ov] of this.overlayMap) {
      if (ov.mode !== "indicator" && ov.loader?.candles?.length > 0) {
        candles = ov.loader.candles
        break
      }
    }
    if (!candles || candles.length === 0) return

    const sliceFrom = Math.max(0, from)
    const sliceTo = Math.min(candles.length, to)
    if (sliceFrom >= sliceTo) return

    const visible = candles.slice(sliceFrom, sliceTo)
    const rows = computeVolumeProfile(visible, VP_DEFAULT_ROWS)
    this._vpPrimitive.setData(rows)
  }

  destroy() {
    this._detachVolumeProfile()
  }
}

export function computeVolumeProfile(candles, numRows) {
  if (!candles || candles.length === 0) return []

  let minLow = Infinity, maxHigh = -Infinity
  for (const c of candles) {
    if (c.low < minLow) minLow = c.low
    if (c.high > maxHigh) maxHigh = c.high
  }
  if (minLow >= maxHigh) return []

  const binSize = (maxHigh - minLow) / numRows
  const bins = new Array(numRows).fill(0)

  for (const c of candles) {
    const vol = c.volume || 0
    if (vol === 0) continue
    const lo = Math.max(0, Math.floor((c.low - minLow) / binSize))
    const hi = Math.min(numRows - 1, Math.floor((c.high - minLow) / binSize))
    const numBins = hi - lo + 1
    const perBin = vol / numBins
    for (let i = lo; i <= hi; i++) {
      bins[i] += perBin
    }
  }

  const rows = []
  for (let i = 0; i < numRows; i++) {
    if (bins[i] === 0) continue
    rows.push({ price: minLow + (i + 0.5) * binSize, volume: bins[i] })
  }
  return rows
}
