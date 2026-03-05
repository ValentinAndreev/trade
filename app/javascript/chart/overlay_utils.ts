export function findFirstPriceSeries(overlayMap: Map<string, any>): any {
  for (const [, ov] of overlayMap) {
    if (ov.mode !== "indicator" && ov.series && ov.visible) return ov.series
  }
  return null
}
