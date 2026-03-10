import type { IChartApi } from "lightweight-charts"
import { LineSeries, HistogramSeries } from "lightweight-charts"
import IndicatorLoader from "./indicator_loader"
import { OVERLAY_COLORS } from "../config/theme"
import { INDICATOR_META } from "../config/indicators"
import { indicatorFieldColors } from "./series_factory"
import { RECOMPUTE_DEBOUNCE_MS } from "../config/constants"
import { normalizeColorScheme, normalizeOpacity } from "../utils/color"
import connectionMonitor from "../services/connection_monitor"
import indicatorCache from "../data/indicator_cache"

export default class IndicatorManager {
  chart: IChartApi
  overlayMap: Map<string, any>
  timeframe: string
  _onScaleSync: () => void
  _recomputeTimers: Map<string, ReturnType<typeof setTimeout>>

  constructor(chart: IChartApi, overlayMap: Map<string, any>, timeframe: string, { onScaleSync }: { onScaleSync: () => void }) {
    this.chart = chart
    this.overlayMap = overlayMap
    this.timeframe = timeframe
    this._onScaleSync = onScaleSync
    this._recomputeTimers = new Map()
  }

  addOverlay(config: any, colorIndex: number): number {
    const ci = normalizeColorScheme(config.colorScheme, colorIndex)
    const colors = OVERLAY_COLORS[ci]
    const visible = config.visible !== false
    const opacity = normalizeOpacity(config.opacity, 1)
    const basePriceScaleId = `overlay-${config.id}`
    const indicatorType = config.indicatorType || "sma"
    const indicatorParams = config.indicatorParams || {}
    const pinnedTo = config.pinnedTo || null

    const indicatorSource = config.indicatorSource || (INDICATOR_META[indicatorType]?.lib ? "client" : "server")

    const ov = {
      series: null,
      mode: "indicator", chartType: "Line",
      colorIndex: ci, colorScheme: ci, opacity, colors, visible,
      basePriceScaleId, activePriceScaleId: basePriceScaleId,
      symbol: config.symbol,
      indicatorType, indicatorParams, indicatorSource, pinnedTo,
      indicatorSeries: [],
    }

    this.overlayMap.set(config.id, ov)

    if (INDICATOR_META[indicatorType]) {
      this.loadData(config.id, ov)
    }
    this._onScaleSync()
    return ci
  }

  async loadData(id: string, ov: any): Promise<void> {
    const meta = INDICATOR_META[ov.indicatorType]
    if (!meta) { this._restorePriceIfEmpty(ov); return }

    const scaleId = meta.overlay ? this.resolveScaleId(ov) : ov.basePriceScaleId

    try {
      const sourceData = this._resolveSourceData(ov)
      const data = await this._compute(ov, sourceData)
      if (!data || data.length === 0) { this._restorePriceIfEmpty(ov); return }

      this.removeSeriesFor(ov)

      const fieldColors = indicatorFieldColors(ov.colors, meta.fields.length, ov.opacity)
      ov.indicatorSeries = meta.fields.map((field, i) => {
        const seriesType = field.seriesType === "Histogram" ? HistogramSeries : LineSeries
        const color = fieldColors[i]
        const options = field.seriesType === "Histogram"
          ? { color, priceScaleId: scaleId, visible: ov.visible }
          : { color, lineWidth: 2, priceScaleId: scaleId, visible: ov.visible }
        const series = this.chart.addSeries(seriesType, options)
        const seriesData = data
          .filter(d => d[field.key] != null)
          .map(d => ({ time: d.time, value: d[field.key] }))
        series.setData(seriesData as any)
        return { series, fieldKey: field.key }
      })

      const symbol = this.resolveSymbol(ov)
      if (symbol) {
        indicatorCache.set(symbol, this.timeframe, ov.indicatorType, ov.indicatorParams || {}, data)
      }
      ov.activePriceScaleId = scaleId
      this._onScaleSync()
    } catch (error) {
      console.error(`Failed to load indicator ${ov.indicatorType} for overlay ${id}:`, error)
      this._restorePriceIfEmpty(ov)
    }
  }

  _restorePriceIfEmpty(ov: any): void {
    if (!ov.indicatorSeries?.length && ov.series) {
      ov.series.applyOptions({ visible: ov.visible !== false })
    }
  }

  updateIndicator(id: string, type: string, params: Record<string, unknown>, pinnedTo: string | null | undefined, source?: string): void {
    const ov = this.overlayMap.get(id)
    if (!ov) return

    const effectiveSource = source ?? ov.indicatorSource
    const isServer = effectiveSource === "server" || !INDICATOR_META[type]?.lib

    if (isServer && !connectionMonitor.backendOnline) {
      ov.indicatorType = type
      ov.indicatorParams = params
      if (pinnedTo !== undefined) ov.pinnedTo = pinnedTo || null
      if (source !== undefined) ov.indicatorSource = source
      return
    }

    this.removeSeriesFor(ov)
    ov.indicatorType = type
    ov.indicatorParams = params
    ov.mode = "indicator"
    if (pinnedTo !== undefined) ov.pinnedTo = pinnedTo || null
    if (source !== undefined) ov.indicatorSource = source
    ov._lastSourceKey = null

    this.loadData(id, ov)
  }

  setPinnedTo(id: string, pinnedTo: string | null): void {
    const ov = this.overlayMap.get(id)
    if (!ov) return
    ov.pinnedTo = pinnedTo || null

    this.removeSeriesFor(ov)
    this.loadData(id, ov)
  }

  refreshAll(sourceId?: string): void {
    for (const [id, ov] of this.overlayMap) {
      if (ov.mode !== "indicator") continue
      if (sourceId && ov.pinnedTo !== sourceId) continue

      const isServer = ov.indicatorSource === "server" || !INDICATOR_META[ov.indicatorType]?.lib
      if (isServer && !connectionMonitor.backendOnline) continue

      if (ov.indicatorSeries?.length) {
        this._scheduleRecompute(id, ov)
      } else if (INDICATOR_META[ov.indicatorType]) {
        this.loadData(id, ov)
      }
    }
  }

  resolveSymbol(ov: any): string | null {
    if (!ov.pinnedTo) return ov.symbol
    const target = this.overlayMap.get(ov.pinnedTo)
    return target ? target.symbol : ov.symbol
  }

  resolveScaleId(ov: any): string {
    if (!ov.pinnedTo) return ov.basePriceScaleId
    const target = this.overlayMap.get(ov.pinnedTo)
    if (!target) return ov.basePriceScaleId
    return target.activePriceScaleId || target.basePriceScaleId
  }

  removeSeriesFor(ov: any): void {
    if (ov.indicatorSeries) {
      ov.indicatorSeries.forEach((s: any) => { try { this.chart.removeSeries(s.series) } catch (e) { console.warn("[indicator] cleanup:", e) } })
      ov.indicatorSeries = []
    }
  }

  // --- Private ---

  _scheduleRecompute(id: string, ov: any): void {
    if (this._recomputeTimers.has(id)) return
    this._recomputeTimers.set(id, setTimeout(() => {
      this._recomputeTimers.delete(id)
      this._recompute(ov)
    }, RECOMPUTE_DEBOUNCE_MS))
  }

  async _recompute(ov: any): Promise<void> {
    try {
      const sourceData = this._resolveSourceData(ov)
      const data = await this._compute(ov, sourceData)
      if (!data) return

      ov.indicatorSeries.forEach(({ series, fieldKey }: { series: any; fieldKey: string }) => {
        const seriesData = data
          .filter(d => d[fieldKey] != null)
          .map(d => ({ time: d.time, value: d[fieldKey] }))
        series.setData(seriesData)
      })
      const symbol = this.resolveSymbol(ov)
      if (symbol) {
        indicatorCache.set(symbol, this.timeframe, ov.indicatorType, ov.indicatorParams || {}, data)
      }
    } catch (error) {
      console.error(`[indicator] recompute failed:`, error)
    }
  }

  async _compute(ov: any, sourceData: any[]): Promise<Record<string, number>[] | null> {
    if (!sourceData || sourceData.length === 0) return []

    const meta = INDICATOR_META[ov.indicatorType]
    const useClient = meta?.lib && ov.indicatorSource !== "server"

    if (useClient && meta?.lib) {
      const result = meta.lib.fn(meta.lib.input(sourceData, ov.indicatorParams || {}))
      const offset = sourceData.length - result.length
      return result.map((val: any, i: number) => ({ time: sourceData[i + offset].time, ...meta.lib!.map(val) }))
    }

    if (!connectionMonitor.backendOnline) return null

    const sourceKey = `${sourceData.length}:${sourceData[0].time}`
    if (ov._lastSourceKey === sourceKey) return null
    ov._lastSourceKey = sourceKey

    const symbol = this.resolveSymbol(ov)
    if (!symbol) return null
    const startTime = sourceData[0].time
    const indLoader = new IndicatorLoader(ov.indicatorType, ov.indicatorParams)
    return indLoader.compute(symbol, this.timeframe, startTime)
  }

  _resolveSourceData(ov: any): any[] {
    const target = ov.pinnedTo ? this.overlayMap.get(ov.pinnedTo) : null

    const candles = target?.loader?.candles
    if (!candles || candles.length === 0) return []

    const field = target?.mode === "volume" ? "volume" : "close"
    return candles.map((c: any) => ({
      time: c.time, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume,
      value: c[field],
    }))
  }
}
