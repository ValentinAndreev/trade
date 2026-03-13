import { describe, it, expect } from "vitest"
import { findFirstPriceSeries } from "../../chart/overlay_utils"
import type { RuntimeOverlay } from "../../types/store"

function makeOverlay(partial: Partial<RuntimeOverlay>): RuntimeOverlay {
  return {
    mode: "price", chartType: "Candlestick", visible: true, colorIndex: 0, colorScheme: 0, opacity: 1,
    colors: { up: "#26a69a", down: "#ef5350", line: "#2196f3" },
    basePriceScaleId: "right", activePriceScaleId: "right",
    symbol: "BTCUSD", indicatorType: null, indicatorParams: null, indicatorSource: "client", pinnedTo: null,
    series: null, indicatorSeries: [],
    ...partial,
  }
}

describe("findFirstPriceSeries", () => {
  it("returns first visible non-indicator overlay series", () => {
    const mockSeries = { type: "Candlestick" }
    const map = new Map([
      ["o-1", makeOverlay({ mode: "price", series: mockSeries as never, visible: true })],
      ["o-2", makeOverlay({ mode: "indicator", series: { type: "Line" } as never, visible: true })],
    ])
    expect(findFirstPriceSeries(map)).toBe(mockSeries)
  })

  it("skips invisible overlays", () => {
    const histogram = { type: "Histogram" }
    const map = new Map([
      ["o-1", makeOverlay({ mode: "price", series: { type: "Candlestick" } as never, visible: false })],
      ["o-2", makeOverlay({ mode: "volume", series: histogram as never, visible: true })],
    ])
    expect(findFirstPriceSeries(map)).toEqual(histogram)
  })

  it("returns null when no matching overlay exists", () => {
    const map = new Map([
      ["o-1", makeOverlay({ mode: "indicator", series: { type: "Line" } as never, visible: true })],
    ])
    expect(findFirstPriceSeries(map)).toBeNull()
  })

  it("returns null for empty map", () => {
    expect(findFirstPriceSeries(new Map())).toBeNull()
  })

  it("skips overlays without series", () => {
    const map = new Map([
      ["o-1", makeOverlay({ mode: "price", series: null, visible: true })],
    ])
    expect(findFirstPriceSeries(map)).toBeNull()
  })
})
