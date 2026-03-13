import type { ISeriesApi, SeriesType } from "lightweight-charts"
import type { RuntimeOverlay } from "../types/store"

export function findFirstPriceSeries(overlayMap: Map<string, RuntimeOverlay>): ISeriesApi<SeriesType> | null {
  for (const [, ov] of overlayMap) {
    if (ov.mode !== "indicator" && ov.series && ov.visible) return ov.series
  }
  return null
}
