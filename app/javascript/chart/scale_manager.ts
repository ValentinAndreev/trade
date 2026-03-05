// Manages price scale assignment for overlays

import type { IChartApi } from "lightweight-charts"
import { INDICATOR_META } from "../config/indicators"

export default class ScaleManager {
  chart: IChartApi
  overlayMap: Map<string, any>
  selectedOverlayId: string | null

  constructor(chart: IChartApi, overlayMap: Map<string, any>) {
    this.chart = chart
    this.overlayMap = overlayMap
    this.selectedOverlayId = null
  }

  syncSelectedOverlayScale(selectedOverlayId: string | null): void {
    this.selectedOverlayId = selectedOverlayId
    if (!this.chart) return

    const visibleUnpinned = []
    for (const [id, ov] of this.overlayMap) {
      if (ov.visible && !ov.pinnedTo) visibleUnpinned.push(id)
    }

    let rightScaleOverlayId = null
    if (this.selectedOverlayId && this.overlayMap.has(this.selectedOverlayId)) {
      const selOv = this.overlayMap.get(this.selectedOverlayId)
      if (selOv.visible) {
        const selMeta = selOv.indicatorType ? INDICATOR_META[selOv.indicatorType] : null
        if (selMeta && !selMeta.overlay) {
          rightScaleOverlayId = this.selectedOverlayId
        } else {
          rightScaleOverlayId = selOv.pinnedTo || this.selectedOverlayId
        }
      }
    }
    if (!rightScaleOverlayId) {
      rightScaleOverlayId = visibleUnpinned[0] || null
    }

    let rightScaleChanged = false
    for (const [id, ov] of this.overlayMap) {
      if (ov.pinnedTo) continue
      const targetScaleId = (rightScaleOverlayId && id === rightScaleOverlayId) ? "right" : ov.basePriceScaleId
      if (ov.activePriceScaleId !== targetScaleId) {
        if (ov.indicatorSeries) {
          ov.indicatorSeries.forEach((s: any) => s.series.applyOptions({ priceScaleId: targetScaleId }))
        } else if (ov.series) {
          ov.series.applyOptions({ priceScaleId: targetScaleId })
        }
        ov.activePriceScaleId = targetScaleId
        if (targetScaleId === "right") rightScaleChanged = true
      }
    }
    for (const [id, ov] of this.overlayMap) {
      if (!ov.pinnedTo) continue
      const meta = ov.indicatorType ? INDICATOR_META[ov.indicatorType] : null
      let targetScaleId
      if (meta && !meta.overlay) {
        targetScaleId = (rightScaleOverlayId === id) ? "right" : ov.basePriceScaleId
      } else {
        const target = this.overlayMap.get(ov.pinnedTo)
        targetScaleId = target ? (target.activePriceScaleId || target.basePriceScaleId) : ov.basePriceScaleId
      }
      if (ov.activePriceScaleId !== targetScaleId) {
        if (ov.indicatorSeries) {
          ov.indicatorSeries.forEach((s: any) => s.series.applyOptions({ priceScaleId: targetScaleId }))
        } else if (ov.series) {
          ov.series.applyOptions({ priceScaleId: targetScaleId })
        }
        ov.activePriceScaleId = targetScaleId
        if (targetScaleId === "right") rightScaleChanged = true
      }
    }

    this.chart.applyOptions({
      leftPriceScale: { visible: false },
      rightPriceScale: { visible: !!rightScaleOverlayId },
    })

    if (rightScaleChanged) {
      try { this.chart.priceScale("right").applyOptions({ autoScale: true }) } catch (e) { console.warn("[scale] autoScale:", e) }
    }

    for (const [, ov] of this.overlayMap) {
      if (ov.activePriceScaleId && ov.activePriceScaleId !== "right") {
        try { this.chart.priceScale(ov.activePriceScaleId).applyOptions({ visible: false }) } catch (e) { console.warn("[scale] hide:", e) }
      }
    }
  }
}
